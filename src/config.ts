import {LLU_API_ENDPOINTS} from './constants/llu-api-endpoints';

function readConfig()
{
    let requiredEnvs: string[] = [];

    if (!isTest())
    {
        requiredEnvs = [
            'NIGHTSCOUT_API_TOKEN',
            'NIGHTSCOUT_URL',
            'LINK_UP_USERNAME',
            'LINK_UP_PASSWORD',
        ];
    }

    for (let envName of requiredEnvs)
    {
        if (!process.env[envName])
        {
            exitLog(`Required environment variable ${envName} is not set`)
        }
    }

    if (process.env.LOG_LEVEL)
    {
        if (!['info', 'debug'].includes(process.env.LOG_LEVEL.toLowerCase()))
        {
            exitLog(`LOG_LEVEL should be either 'info' or 'debug', but got '${process.env.LOG_LEVEL}'`);
        }
    }

    if (process.env.LINK_UP_REGION)
    {
        if (!LLU_API_ENDPOINTS.hasOwnProperty(process.env.LINK_UP_REGION))
        {
            exitLog(`LINK_UP_REGION should be one of ${Object.keys(LLU_API_ENDPOINTS)}, but got ${process.env.LINK_UP_REGION}`);
        }
    }

    if (process.env.LINK_UP_TIME_INTERVAL)
    {
        if (isNaN(parseInt(process.env.LINK_UP_TIME_INTERVAL)))
        {
            exitLog(`LINK_UP_TIME_INTERVAL expected to be an integer, but got '${process.env.LINK_UP_TIME_INTERVAL}'`);
        }
    }

    const protocol =
        process.env.NIGHTSCOUT_DISABLE_HTTPS === 'true' ? 'http://' : 'https://';
    const url = new URL(protocol + process.env.NIGHTSCOUT_URL);

    return {
        nightscoutApiToken: process.env.NIGHTSCOUT_API_TOKEN as string,
        nightscoutBaseUrl: url.toString(),
        linkUpUsername: process.env.LINK_UP_USERNAME as string,
        linkUpPassword: process.env.LINK_UP_PASSWORD as string,

        logLevel: process.env.LOG_LEVEL || 'info',
        singleShot: process.env.SINGLE_SHOT === 'true',
	allData: process.env.ALL_DATA === 'true',

        nightscoutApiV3: process.env.NIGHTSCOUT_API_V3 === 'true',
        nightscoutDisableHttps: process.env.NIGHTSCOUT_DISABLE_HTTPS === 'true',
        nightscoutDevice: process.env.DEVICE_NAME || 'nightscout-librelink-up',

        linkUpRegion: process.env.LINK_UP_REGION || 'EU',
        linkUpTimeInterval: Number(process.env.LINK_UP_TIME_INTERVAL) || 5,
        linkUpConnection: process.env.LINK_UP_CONNECTION as string,
    };
}

function exitLog(msg: string): void
{
    console.log(msg);

    if (!isTest())
    {
        process.exit(1);
    }
}

function isTest(): boolean
{
    return typeof jest !== "undefined";
}

export default readConfig;
