import {Entry, NightscoutAPI, NightscoutConfig} from "./interface";
import axios, {RawAxiosRequestHeaders} from "axios";

interface NightscoutHttpHeaders extends RawAxiosRequestHeaders
{
    "api-secret": string | undefined;
}

export class Client implements NightscoutAPI
{
    readonly baseUrl: string;
    readonly headers: NightscoutHttpHeaders;
    readonly device: string;

    constructor(config: NightscoutConfig)
    {
        this.baseUrl = config.nightscoutBaseUrl;
        this.headers = {
            "api-secret": config.nightscoutApiToken,
            "User-Agent": "FreeStyle LibreLink Up NightScout Uploader",
            "Content-Type": "application/json",
        };
        this.device = config.nightscoutDevice;
    }

    async lastEntry(): Promise<Entry | null>
    {
        const url = new URL("/api/v1/entries?count=1", this.baseUrl).toString();
        const resp = await axios.get(url, {headers: this.headers});

        if (resp.status !== 200)
        {
            throw Error(`failed to get last entry: ${resp.statusText}`);
        }

        if (!resp.data || resp.data.length === 0)
        {
            return null;
        }
        return resp.data.pop();
    }

    async uploadEntries(entries: Entry[]): Promise<void>
    {
        const url = new URL("/api/v1/entries", this.baseUrl).toString();
        const entriesV1 = entries.map((e) => ({
            type: "sgv",
            sgv: e.sgv,
            direction: e.direction?.toString(),
            device: this.device,
            date: e.date.getTime(),
            dateString: e.date.toISOString(),
        }));

        const resp = await axios.post(url, entriesV1, {headers: this.headers});

        if (resp.status !== 200)
        {
            throw Error(`failed to post new entries: ${resp.statusText}`);
        }

        return;
    }
}
