const https = require("https")
const fs = require("fs");
const path = require("path");

/**
 * LibreLink Up Credentials
 */
const LINK_UP_USERNAME = process.env.LINK_UP_USERNAME;
const LINK_UP_PASSWORD = process.env.LINK_UP_PASSWORD;

/**
 * Nightscout API
 */
const NIGHTSCOUT_URL = process.env.NIGHTSCOUT_URL;
const NIGHTSCOUT_API_TOKEN = process.env.NIGHTSCOUT_API_TOKEN;

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const API_URL = "api-eu.libreview.io"
const VAR_FILE = "token.json";
const USER_AGENT = "FreeStyle LibreLink Up Nightscout Uploader";
const LIBRE_LINK_UP_VERSION = "4.1.1";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

if (fs.existsSync(VAR_FILE)) {
    main();
}
else {
    console.log("Please set login credentials");
}

function main() {

    if (hasValidAuthentication()) {
        getGlucoseMeasurement();
    }
    else {
        deleteToken();
        login();
    }
}

function login() {

    const data = new TextEncoder().encode(
        JSON.stringify({
            email: LINK_UP_USERNAME,
            password: LINK_UP_PASSWORD,
        })
    )

    const options = {
        hostname: API_URL,
        port: 443,
        path: "/llu/auth/login",
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Content-Length": data.length,
            "version": LIBRE_LINK_UP_VERSION,
            "product": LIBRE_LINK_UP_PRODUCT,
        }
    }

    const req = https.request(options, res => {
        if (res.statusCode !== 200) {
            console.error("Invalid credentials");
            deleteToken();
        }

        res.on("data", response => {
            try {
                let responseObject = JSON.parse(response);
                try {
                    updateAuthTicket(responseObject.data.authTicket);
                    getGlucoseMeasurement();
                } catch (err) {
                    console.error("Invalid authentication token");
                }
            } catch (err) {
                console.error("Invalid response");
            }
        })
    })

    req.on("error", error => {
        console.error("Invalid response");
    })

    req.write(data)
    req.end()
}

function getGlucoseMeasurement() {
    const options = {
        hostname: API_URL,
        port: 443,
        path: "/llu/connections",
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "version": LIBRE_LINK_UP_VERSION,
            "product": LIBRE_LINK_UP_PRODUCT,
            "authorization": "Bearer " + getAuthenticationTokenFromFile()
        }
    }

    const req = https.request(options, res => {
        if (res.statusCode !== 200) {
            console.error("Invalid credentials");
            deleteToken();
        }

        res.on("data", response => {
            try {
                let responseObject = JSON.parse(response);
                if (responseObject.message === "invalid or expired jwt") {
                    deleteToken();
                    login();
                }
                else {
                    let glucoseMeasurement = responseObject.data[0].glucoseMeasurement.Value;
                    uploadToNightscout(glucoseMeasurement);
                }
            } catch (err) {
                console.error("Invalid response");
            }
        })
    })

    req.on("error", error => {
        console.error("Invalid response");
    })
    req.end()
}

function uploadToNightscout(glucoseMeasurement) {
    const uploadDate = new Date();
    const data = new TextEncoder().encode(
        JSON.stringify([
            {
                "type": "sgv",
                "dateString": uploadDate.toISOString(),
                "date": uploadDate.getTime(),
                "sgv": glucoseMeasurement
            }
        ])
    )

    const options = {
        hostname: NIGHTSCOUT_URL,
        port: 443,
        path: "/api/v1/entries",
        method: "POST",
        headers: {
            "api-secret": NIGHTSCOUT_API_TOKEN,
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
            "Content-Length": data.length,
        }
    }

    const req = https.request(options, res => {
        if (res.statusCode !== 200) {
            console.error("Invalid credentials");
            deleteToken();
        }

        res.on("data", response => {
            console.log("Upload to Nightscout successfull");
        })
    })

    req.on("error", error => {
        console.error("Invalid Nightscout response", error.message);
    })

    req.write(data)
    req.end()
}

function deleteToken() {
    updateAuthTicket(null);
}

function updateAuthTicket(authTicket) {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                dataObject.authTicket = authTicket;
                fs.writeFileSync(VAR_FILE, JSON.stringify(dataObject));
            } catch (error) {
                return;
            }
        }
    } catch (error) {
        return;
    }
}

function getAuthenticationTokenFromFile() {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                return dataObject.authTicket.token;

            } catch (error) {
                return null;
            }
        }
    } catch (error) {
        return null;
    }
}

function hasValidAuthentication() {
    try {
        const data = fs.readFileSync(VAR_FILE, "utf8")
        if (data) {
            try {
                let dataObject = JSON.parse(data);
                let expiryDate = dataObject.authTicket.expires;
                let currentDate = Math.round(new Date().getTime() / 1000);
                if (currentDate < expiryDate) {
                    return true;
                }
                return false;

            } catch (error) {
                return false;
            }
        }
    } catch (error) {
        return false;
    }
}