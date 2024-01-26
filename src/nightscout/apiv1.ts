import { Entry, NightscoutAPI } from './interface';
import { OutgoingHttpHeaders } from 'http';
import axios from 'axios';

interface nightscoutHttpHeaders extends OutgoingHttpHeaders {
	'api-secret': string | undefined;
}

export class Client implements NightscoutAPI {
	readonly baseUrl: string;
	readonly headers: nightscoutHttpHeaders;
	readonly device: string;

	constructor(
		apiSecret: string,
		baseUrl: string,
		disableHttps: boolean = false,
		device: string = 'nightscout-librelink-up'
	) {
		const protocol = disableHttps ? 'http://' : 'https://';
		this.baseUrl = protocol + baseUrl;
		this.headers = {
			'api-secret': apiSecret,
			'User-Agent': 'FreeStyle LibreLink Up NightScout Uploader',
			'Content-Type': 'application/json',
		};
		this.device = device;
	}

	async lastEntry(): Promise<Entry | null> {
		const url = new URL('/api/v1/entries?count=1', this.baseUrl).toString();
		const resp = await axios.get(url, { headers: this.headers });
		if (!resp.data || resp.data.length === 0) {
			return null;
		}
		return resp.data.pop();
	}

	async uploadEntries(entries: Entry[]): Promise<void> {
		const url = this.baseUrl + '/api/v1/entries';
		const entriesV1 = entries.map((e) => ({
			type: 'sgv',
			sgv: e.sgv,
			direction: e.direction?.toString(), // check
			device: this.device,
			date: e.date.getTime(),
			dateString: e.date.toISOString(),
		}));
		const resp = await axios.post(url, entriesV1, { headers: this.headers });
		if (resp.status !== 200) {
			// TODO: use logger
			console.log(`Upload to NightScout failed: ${resp.statusText}`);
		} else {
			console.log(
				`Upload of ${entries.length} measurements to Nightscout succeeded`
			);
		}

		return Promise.resolve();
	}
}

export default Client;
