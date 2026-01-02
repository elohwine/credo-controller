const sendToWebWallet = (walletUrl: String, path: String, requestUrl: String) => {
    let request = requestUrl.replaceAll("\n", "").trim()

    let queryParams = ""
    if (request.includes('?')) {
        queryParams = request.substring(request.indexOf('?'))
    } else {
        // Assume it is a direct offer URI if no query params present
        // This handles http://.../offers/uuid format
        queryParams = `?credential_offer_uri=${encodeURIComponent(request)}`
    }

    window.open(`${walletUrl}/${path}${queryParams}`, '_blank');
}

export { sendToWebWallet };
