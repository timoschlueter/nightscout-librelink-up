import axios, { RawAxiosRequestHeaders } from "axios";
import { logger } from "..";
import { Entry, NightscoutAPI, NightscoutConfig } from "./interface";

interface NightscoutApiV3HttpHeaders extends RawAxiosRequestHeaders {
  Authorization: string;
}

export class Client implements NightscoutAPI {
  readonly baseUrl: string;
  readonly headers: NightscoutApiV3HttpHeaders;
  readonly device: string;
  readonly accessToken: string;
  readonly app: string;

  constructor(config: NightscoutConfig) {
    this.baseUrl = config.nightscoutBaseUrl;
    this.headers = {
      "User-Agent": "FreeStyle LibreLink Up NightScout Uploader",
      "Content-Type": "application/json",
      Authorization: "",
    };
    this.device = config.nightscoutDevice;
    this.accessToken = config.nightscoutApiToken;
    this.app = config.nightscoutApp;
  }

  private addBearerJwtToken(jwtToken: string): string {
    if (!jwtToken) {
      throw Error("No jwtToken found");
    }
    return `Bearer ${jwtToken}`;
  }

  async getJwtToken(): Promise<string> {
    let newToken = "";
    try {
      const url = new URL(
        `/api/v2/authorization/request/${this.accessToken}`,
        this.baseUrl
      ).toString();
      const resp = await axios.get(url, {
        headers: {
          ...this.headers,
          Accept: "application/json",
        },
      });
      if (resp.status !== 200 || !resp.data.token) {
        throw Error(`Error getting JWT token: ${resp.statusText} `);
      }
      newToken = await resp.data.token;
    } catch (error) {
      logger.error("Error getting JWT token:", error);
    }
    return newToken;
  }

  async lastEntry(): Promise<Entry | null> {
    const jwtToken = await this.getJwtToken();
    const url = new URL(
      "/api/v3/entries?limit=1&sort$desc=date",
      this.baseUrl
    ).toString();
    const resp = await axios.get(url, {
      headers: {
        ...this.headers,
        Authorization: this.addBearerJwtToken(jwtToken),
      } as NightscoutApiV3HttpHeaders,
    });
    if (resp.status !== 200) {
      throw Error(`Failed to get last entry: ${resp.statusText}`);
    }
    if (!resp.data.result || resp.data.result.length === 0) {
      throw Error(
        `Last entry not found in response data: ${JSON.stringify(resp.data)}`
      );
    }
    return resp.data.result.pop();
  }

  async uploadEntries(entries: Entry[]): Promise<void> {
    const jwtToken = await this.getJwtToken();
    const url = new URL("/api/v3/entries", this.baseUrl).toString();

    if (!entries.length) {
      throw Error(`No entries to upload`);
    }

    const entryPayloads = entries.map((entry) => ({
      type: "sgv",
      sgv: entry.sgv,
      direction: entry.direction?.toString(),
      device: this.device,
      date: entry.date.getTime(),
      app: this.app,
    }));

    // APIv3 accepts only single entries
    const responses = await Promise.all(
      entryPayloads.map((entryV3) =>
        axios.post(url, entryV3, {
          headers: {
            ...this.headers,
            Authorization: this.addBearerJwtToken(jwtToken),
          } as NightscoutApiV3HttpHeaders,
        })
      )
    );

    responses.forEach((resp) => {
      if (resp.status !== 201) {
        throw Error(
          `failed to post new entries: ${resp.statusText} ${resp.status}`
        );
      }
    });
    return;
  }
}
