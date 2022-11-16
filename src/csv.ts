import * as fs from "fs";

export type CsvValue = string | number | null | undefined;
export type CsvFormat = CsvValue[][];

// creates 2 dimensional array of csv data
export function toCsvFormat(arr: object[]): CsvFormat {
    const colNameToIdx = new Map<string, number>();

    const setValue = (
        row: CsvValue[],
        path: string[],
        val: unknown,
    ): CsvValue[] => {
        if (Object(val) !== val) {
            // handle primitive value
            const columnName = path.join('.');
            const idx = (
                colNameToIdx.has(columnName)
                    ? colNameToIdx
                    : colNameToIdx.set(columnName, colNameToIdx.size)
            ).get(columnName);
            if (idx !== undefined) {
                // eslint-disable-next-line functional/immutable-data
                row[idx] = val as CsvValue; // not an object - check above
            }
        } else {
            // handle non-primitive value
            Object.keys(val as object).forEach(key => {
                if (key === '0') {
                    // handle array
                    setValue(row, path, (val as unknown[])[key]);
                } else {
                    // handle object key
                    setValue(
                        row,
                        path.concat(key),
                        (val as { [key: string]: unknown })[key],
                    );
                }
            });
        }
        return row;
    };

    const result = arr.map(obj => setValue([], [], obj));
    return [[...colNameToIdx.keys()], ...result];
}

// creates csv string
export function toCsvString(data: CsvFormat): string {
    return data.map((row: CsvValue[]) => row.join(',')).join('\n');
}

// parse array of objects and download as .csv file
export function createCSV(
    data: object[],
    filename = 'duplicities_parsed',
): void {
    const csvData = toCsvFormat(data);
    const csvContent = toCsvString(csvData);

    // const encodedUri = encodeURI(
    //     // prepend csv file header before csv content
    //     `data:text/csv;charset=utf-8, ${csvContent}`,
    // );

    fs.writeFileSync(`outputs/csv/${filename}.csv`, csvContent);
}