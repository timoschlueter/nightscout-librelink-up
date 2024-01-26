/**
 * Interfaces related to the Nightscout API
 *
 * SPDX-License-Identifier: MIT
 */

export interface NightscoutAPI {
	lastEntry(): Promise<Entry | null>;
	uploadEntries(entries: Entry[]): Promise<void>;
}

export interface NightscoutConfig {
	nightscoutApiToken: string;
	nightscoutBaseUrl: string;
	nightscoutDevice: string;
}

export interface Entry {
	date: Date;
	sgv: number;
	direction?: Direction;
}

export enum Direction {
	SingleDown = 'SingleDown',
	FortyFiveDown = 'FortyFiveDown',
	Flat = 'Flat',
	FortyFiveUp = 'FortyFiveUp',
	SingleUp = 'SingleUp',
	NotComputable = 'NOT COMPUTABLE',
}
