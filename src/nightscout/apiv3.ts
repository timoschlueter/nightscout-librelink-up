import { Entry, NightscoutAPI, NightscoutConfig } from './interface';

export class Client implements NightscoutAPI {
	constructor(config: NightscoutConfig) {
		throw new Error('Not implemented');
	}

	async lastEntry(): Promise<Entry | null> {
		throw new Error('Not implemented');
	}

	async uploadEntries(entries: Entry[]): Promise<void> {
		throw new Error('Not implemented');
	}
}
