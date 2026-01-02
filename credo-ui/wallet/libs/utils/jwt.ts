function parseJwt(token: string | object | any) {
    // If token is not a string, return it as-is (already parsed or object)
    if (typeof token !== 'string') {
        return token;
    }

    // If it's not a JWT format (no dots), try parsing as JSON
    if (!token.includes('.')) {
        try {
            return JSON.parse(token);
        } catch {
            return token;
        }
    }

    var base64Url = token.split('.')[1];
    if (!base64Url) {
        return token;
    }

    var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    try {
        return JSON.parse(jsonPayload);
    } catch (error) {
        return jsonPayload;
    }
}

export { parseJwt };