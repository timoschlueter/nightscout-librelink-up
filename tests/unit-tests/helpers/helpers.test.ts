import "jest";
import {getUtcDateFromString, mapTrendArrow} from "../../../src/helpers/helpers";

describe("Helpers", () => {
    it("Mapping Trend Arrows from LibreLink Up to Nightscout", async () =>
    {
        expect(mapTrendArrow(1)).toBe("SingleDown");
        expect(mapTrendArrow(2)).toBe("FortyFiveDown");
        expect(mapTrendArrow(3)).toBe("Flat");
        expect(mapTrendArrow(4)).toBe("FortyFiveUp");
        expect(mapTrendArrow(5)).toBe("SingleUp");
        expect(mapTrendArrow(0)).toBe("NOT COMPUTABLE");
    });

    it("Converting LibreLink Up timestamp to UTC epoch time", async () =>
    {
        const sampleFactoryTimestamp = "12/30/2022 4:42:41 PM";
        const utcDateFromString = getUtcDateFromString(sampleFactoryTimestamp);
        expect(utcDateFromString.getTime()).toBe(1672418561000);
    });
});
