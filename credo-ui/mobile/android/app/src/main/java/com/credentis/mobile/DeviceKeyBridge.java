package com.credentis.mobile;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;

/** Hardware-backed signing key. Android requires a biometric before the key can sign. */
public final class DeviceKeyBridge {
    static final String ALIAS = "credentis-device-trust";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String SIGN_ALGORITHM = "SHA256withECDSA";
    private final MainActivity activity;

    DeviceKeyBridge(MainActivity activity) {
        this.activity = activity;
    }

    boolean available() {
        int result = BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        return result == BiometricManager.BIOMETRIC_SUCCESS;
    }

    boolean loginAvailable() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            BiometricManager.from(activity).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL
            ) == BiometricManager.BIOMETRIC_SUCCESS;
    }

    String enrollForAccount(String input) throws Exception {
        JSONObject options = new JSONObject(input);
        String wallet = options.getString("walletTenantId");
        String challenge = options.getString("challenge");
        String usage = options.getString("usage");
        if (wallet.isEmpty() || challenge.length() < 32 || (!usage.equals("login") && !usage.equals("payment"))) {
            throw new IllegalArgumentException("Invalid device enrollment request.");
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            throw new IllegalStateException("Secure device login requires Android 11 or newer.");
        }
        String scope = base64(MessageDigest.getInstance("SHA-256").digest(wallet.getBytes("UTF-8")));
        String alias = "credentis-" + usage + "-" + scope + "-" + java.util.UUID.randomUUID();
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE);
        boolean login = usage.equals("login");
        generator.initialize(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(!login)
            .setUserAuthenticationParameters(0, login
                ? KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL
                : KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setAttestationChallenge(challenge.getBytes("UTF-8"))
            .build());
        generator.generateKeyPair();
        JSONObject description = new JSONObject(describe(alias, true));
        description.put("alias", alias);
        return description.toString();
    }

    boolean hasKey(String alias) throws Exception {
        requireAppAlias(alias);
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        store.load(null);
        return store.containsAlias(alias);
    }

    void removeKey(String alias) throws Exception {
        requireAppAlias(alias);
        KeyStore store = KeyStore.getInstance(ANDROID_KEYSTORE);
        store.load(null);
        store.deleteEntry(alias);
    }

    private void requireAppAlias(String alias) {
        if (alias == null || !alias.matches("credentis-(login|payment)-[A-Za-z0-9_-]+-[a-f0-9-]{36}")) {
            throw new IllegalArgumentException("Invalid Credentis device key.");
        }
    }

    String enroll() throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            throw new IllegalStateException("This phone is too old for a hardware key that requires fingerprint or face.");
        }
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE);
        generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)
            .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setAttestationChallenge("credentis-device-trust".getBytes("UTF-8"))
            .build());
        generator.generateKeyPair();
        return describe(true);
    }

    String publicDescription() throws Exception {
        return describe(false);
    }

    void sign(String payload) throws Exception {
        signWithKey(ALIAS, payload, false);
    }

    void signForKey(String alias, String payload) throws Exception {
        requireAppAlias(alias);
        signWithKey(alias, payload, alias.startsWith("credentis-login-"));
    }

    private void signWithKey(String alias, String payload, boolean login) throws Exception {
        Signature signature = Signature.getInstance(SIGN_ALGORITHM);
        signature.initSign(privateKey(alias));
        BiometricPrompt prompt = new BiometricPrompt(activity, activity.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                try {
                    Signature unlocked = result.getCryptoObject() == null ? null : result.getCryptoObject().getSignature();
                    if (unlocked == null) throw new IllegalStateException("Fingerprint did not unlock the phone key.");
                    unlocked.update(payload.getBytes("UTF-8"));
                    String encoded = Base64.encodeToString(unlocked.sign(), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
                    activity.deliverDeviceSignature(encoded, null);
                } catch (Exception error) {
                    activity.deliverDeviceSignature(null, error.getMessage());
                }
            }

            @Override
            public void onAuthenticationError(int errorCode, CharSequence errString) {
                activity.deliverDeviceSignature(null, String.valueOf(errString));
            }
        });
        BiometricPrompt.PromptInfo.Builder promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Confirm it is you")
                .setSubtitle(login ? "Fingerprint, face or device screen lock" : "Fingerprint or face")
                .setAllowedAuthenticators(login
                    ? BiometricManager.Authenticators.BIOMETRIC_STRONG | BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    : BiometricManager.Authenticators.BIOMETRIC_STRONG);
        if (!login) promptInfo.setNegativeButtonText("Not now");
        prompt.authenticate(
            promptInfo.build(),
            new BiometricPrompt.CryptoObject(signature)
        );
    }

    private PrivateKey privateKey() throws Exception {
        return privateKey(ALIAS);
    }

    private PrivateKey privateKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(alias, null);
        if (!(entry instanceof KeyStore.PrivateKeyEntry)) throw new IllegalStateException("This phone is not enrolled yet.");
        return ((KeyStore.PrivateKeyEntry) entry).getPrivateKey();
    }

    private String describe(boolean requireHardware) throws Exception {
        return describe(ALIAS, requireHardware);
    }

    private String describe(String alias, boolean requireHardware) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        Certificate[] chain = keyStore.getCertificateChain(alias);
        if (chain == null || chain.length == 0) throw new IllegalStateException("This phone is not enrolled yet.");
        ECPublicKey publicKey = (ECPublicKey) chain[0].getPublicKey();
        ECPoint point = publicKey.getW();
        JSONObject jwk = new JSONObject();
        jwk.put("kty", "EC");
        jwk.put("crv", "P-256");
        jwk.put("x", base64(unsigned(point.getAffineX().toByteArray(), 32)));
        jwk.put("y", base64(unsigned(point.getAffineY().toByteArray(), 32)));

        KeyFactory factory = KeyFactory.getInstance(publicKey.getAlgorithm(), ANDROID_KEYSTORE);
        KeyInfo info = factory.getKeySpec(privateKey(alias), KeyInfo.class);
        if (requireHardware && !info.isInsideSecureHardware()) {
            keyStore.deleteEntry(alias);
            throw new IllegalStateException("This phone could not keep the key in secure hardware.");
        }
        JSONObject attestation = new JSONObject();
        attestation.put("hardwareBacked", info.isInsideSecureHardware());
        attestation.put("userAuthenticationRequired", info.isUserAuthenticationRequired());
        attestation.put("securityLevel", info.isInsideSecureHardware() ? "TrustedEnvironment" : "Software");
        JSONArray purposes = new JSONArray();
        if ((info.getPurposes() & KeyProperties.PURPOSE_SIGN) != 0) purposes.put("sign");
        attestation.put("purposes", purposes);
        JSONArray certificates = new JSONArray();
        for (Certificate certificate : chain) certificates.put(Base64.encodeToString(certificate.getEncoded(), Base64.NO_WRAP));
        attestation.put("certificateChain", certificates);
        JSONObject out = new JSONObject();
        out.put("publicJwk", jwk);
        out.put("attestation", attestation);
        out.put("platform", "android");
        return out.toString();
    }

    private static byte[] unsigned(byte[] value, int size) {
        if (value.length == size) return value;
        byte[] out = new byte[size];
        int copy = Math.min(value.length, size);
        System.arraycopy(value, value.length - copy, out, size - copy, copy);
        return out;
    }

    private static String base64(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
}
