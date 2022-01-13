const cron = require("node-cron");
const axios = require("axios");
const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;

const NIGHTSCOUT_TREND_ARROWS = require('./nightscoutTrendArrows');

const logFormat = printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level}]: ${message}`;
});

const logger = createLogger({
    format: combine(
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console(),
    ]
});

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
const USER_AGENT = "FreeStyle LibreLink Up Nightscout Uploader";
const LIBRE_LINK_UP_VERSION = "4.1.1";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";

let authTicket = {};

const libreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
}

const nightScoutHttpHeaders = {
    "api-secret": NIGHTSCOUT_API_TOKEN,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
}

logger.info("Started")
cron.schedule("* * * * *", () => {
    main();
});

function main() {
    if (hasValidAuthentication()) {
        getGlucoseMeasurement();
    }
    else {
        deleteToken();
        login();
    }
}

async function login() {
    const url = "https://" + API_URL + "/llu/auth/login"
    try {
        const response = await axios.post(url,
            {
                email: LINK_UP_USERNAME,
                password: LINK_UP_PASSWORD,
            },
            {
                headers: libreLinkUpHttpHeaders
            });

        try {
            const responseData = response.data;
            updateAuthTicket(responseData.data.authTicket);
            logger.info("Logged in to LibreLink Up");
            getGlucoseMeasurement();
        } catch (err) {
            logger.error("Invalid authentication token. Please check your LibreLink Up credentials");
        }
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
    }
}

async function getGlucoseMeasurement() {
    let connectionId = await getLibreLinkUpConnection();

    const url = "https://" + API_URL + "/llu/connections/" + connectionId + "/graph"

    let authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.authorization = "Bearer " + getAuthenticationToken();

    try {
        const response = await axios.get(url,
            {
                headers: authenticatedHttpHeaders
            });

        const responseData = response.data;
        let measurementData = responseData.data;
        logger.info("Received blood glucose measurement");
        uploadToNightscout(measurementData);
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
    }
}

async function getLibreLinkUpConnection() {
    const url = "https://" + API_URL + "/llu/connections"

    let authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.authorization = "Bearer " + getAuthenticationToken();

    try {
        const response = await axios.get(url,
            {
                headers: authenticatedHttpHeaders
            });

        const responseData = response.data;
        let connectionData = responseData.data;
        if (connectionData.length > 1) {
            logger.error("Multiple connections found. This is not yet supported.")
            return null;
        }
        return connectionData[0].patientId;
    } catch (error) {
        logger.error("Invalid credentials");
        deleteToken();
        return null;
    }
}

async function uploadToNightscout(measurementData) {
    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;
    const measurementDate = getUtcDateFromString(glucoseMeasurement.FactoryTimestamp);
    const glucoseMeasurementHistory = measurementData.graphData;

    let formattedMeasurements = [];

    // Add the most recent measurement first
    formattedMeasurements.push({
        "type": "sgv",
        "dateString": measurementDate.toISOString(),
        "date": measurementDate.getTime(),
        "direction": mapTrendArrow(glucoseMeasurement.TrendArrow),
        "sgv": glucoseMeasurement.Value
    });

    // Backfill with measurements from the graph data. Note: Nightscout handles duplicates. 
    // We don't have to worry about them here.
    glucoseMeasurementHistory.forEach((glucoseMeasurementHistoryEntry) => {
        let measurementDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        formattedMeasurements.push({
            "type": "sgv",
            "dateString": measurementDate.toISOString(),
            "date": measurementDate.getTime(),
            "sgv": glucoseMeasurementHistoryEntry.Value
        });
    });

    const url = "https://" + NIGHTSCOUT_URL + "/api/v1/entries"
    try {
        const response = await axios.post(url,
            formattedMeasurements,
            {
                headers: nightScoutHttpHeaders
            });

        logger.info("Upload of " + formattedMeasurements.length + " measurements to Nightscout successfull");
    } catch (error) {
        logger.error("Upload to Nightscout failed");
        deleteToken();
    }
}

function mapTrendArrow(libreTrendArrowRaw) {
    switch (libreTrendArrowRaw) {
        case 1:
            return NIGHTSCOUT_TREND_ARROWS.singleDown
        case 2:
            return NIGHTSCOUT_TREND_ARROWS.fortyFiveDown
        case 3:
            return NIGHTSCOUT_TREND_ARROWS.flat
        case 4:
            return NIGHTSCOUT_TREND_ARROWS.fortyFiveUp
        case 5:
            return NIGHTSCOUT_TREND_ARROWS.singleUp
        default:
            return NIGHTSCOUT_TREND_ARROWS.notComputable
    }
}

function deleteToken() {
    authTicket = {};
}

function updateAuthTicket(newAuthTicket) {
    authTicket = newAuthTicket;
}

function getAuthenticationToken() {
    if (authTicket.token) {
        return authTicket.token;
    }
    return null;
}

function hasValidAuthentication() {
    let expiryDate = authTicket.expires;
    let currentDate = Math.round(new Date().getTime() / 1000);
    if (currentDate < expiryDate) {
        return true;
    }
    return false;
}

function getUtcDateFromString(timeStamp) 
{
    let utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - new Date().getTimezoneOffset() * 60 * 1000);
    return utcDate;
}