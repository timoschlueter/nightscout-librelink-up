/**
 * Helper Functions
 *
 * SPDX-License-Identifier: MIT
 */
import { Direction } from "../nightscout/interface";

export function mapTrendArrow(libreTrendArrowRaw: number): Direction {
	switch (libreTrendArrowRaw) {
		case 1:
			return Direction.SingleDown;
		case 2:
			return Direction.FortyFiveDown;
		case 3:
			return Direction.Flat;
		case 4:
			return Direction.FortyFiveUp;
		case 5:
			return Direction.SingleUp;
		default:
			return Direction.NotComputable;
	}
}

export function getUtcDateFromString(timeStamp: string): Date
{
    const utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - utcDate.getTimezoneOffset() * 60 * 1000);
    return utcDate;
}
