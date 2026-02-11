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

const sleep: (seconds?: number) => Promise<unknown> = (seconds = 0): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export const retry = async <T>(
    fn: () => Promise<T> | T,
    { retryAttempts, retryIntervalSeconds }: { retryAttempts: number; retryIntervalSeconds: number }
): Promise<T> => {
    try {
        return await fn();

    } catch (error) {
        if (retryAttempts <= 0) {
            throw error;
        }

        await sleep(retryIntervalSeconds);

        return retry(fn, { retryAttempts: retryAttempts - 1, retryIntervalSeconds });
    }
}
