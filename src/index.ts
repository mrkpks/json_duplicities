import * as fs from "fs";
import { createCSV } from "./csv.js";

const hashes = new Map<
  number,
  { count: number; occurrences: Set<string>; item: object; path: string[] }
>();

function sortObj(unordered: object): object {
  return [...Object.keys(unordered)].sort().reduce((obj, key) => {
    // @ts-ignore
    obj[key] = unordered[key];
    return obj;
  }, {});
}

function getItemSize(item: object): number {
  return JSON.stringify(item).length;
}

const flattenObj = (ob: object) => {
  // The object which contains the
  // final result
  let result = {};

  // loop through the object "ob"
  for (const i in ob) {
    // We check the type of the i using
    // typeof() function and recursively
    // call the function again
    // @ts-ignore
    if (typeof ob[i] === "object" && !Array.isArray(ob[i])) {
      // @ts-ignore
      const temp = flattenObj(ob[i]);
      for (const j in temp) {
        // Store temp in result
        // @ts-ignore
        result[i + "." + j] = temp[j];
      }
    }

    // Else store ob[i] in result directly
    else {
      // @ts-ignore
      result[i] = ob[i];
    }
  }
  return result;
};

// todo: fix nested objects sorting
// sortNestedObj(unordered: object): object {
//   // eslint-disable-next-line functional/immutable-data
//   let ordered = {};
//   Object.keys(unordered).forEach(key => {
//     // @ts-expect-error pls nebud kokot
//     if (!Array.isArray(unordered[key]) && Object(unordered[key]) === unordered[key]) {
//       // @ts-expect-error pls nebud kokot
//       sortNestedObj(unordered[key]);
//     }
//       ordered = sortObj(unordered);
//   });
//   return ordered;
// }

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function handleObjValue(
  val: unknown,
  keyName: string,
  path: string[] = []
): void {
  // console.warn("keyName: ", keyName);
  // handle primitive value; (ignore null & undefined - remove the condition if needed)
  if (Object(val) !== val || val == null) {
    /**
     * Note: This is a no-op: we don't need to check for duplicities in primitive values
     * add hashing and storing the primitive duplicities if needed - same way as below for object or unknown[]
     * */
    // console.log("ignoring primitive value: ", val);
  } else {
    // sorts the payload keys alphabetically (only on the top level - nested objects are not sorted)
    const hash = simpleHash(JSON.stringify(sortObj(val as object)));
    const entry = hashes.get(hash);
    if (entry) {
      hashes.set(hash, {
        ...entry,
        occurrences: entry.occurrences.add(keyName),
        count: entry.count + 1,
        path,
      });
    } else {
      hashes.set(hash, {
        count: 1,
        occurrences: new Set("").add(keyName),
        item: val as object | unknown[],
        path: [],
      });
    }
    Object.keys(val as object).forEach((key) => {
      // handle array // todo: array is also an object so it can be combined - decide if we need to treat arrays differently
      if (Array.isArray(val)) {
        handleObjValue((val as unknown[])[key as unknown as number], key, [
          ...path,
          `[${key}]`,
        ]);
      } else {
        // handle an object
        // @ts-ignore
        handleObjValue((val as object)[key], key, [...path, key]);
      }
    });
  }
}

const inputPath = process.argv.find((arg) => arg.includes(".json"));

if (inputPath) {
  const inputData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  if (inputData) {
    console.info("Parsing started at: ", new Date().toISOString());
    const fileStats = fs.statSync(inputPath);
    const fileSizeInBytes = fileStats.size;

    /**
     * Parse the input object (XHR response)
     *
     * input:
     *  JSON object (XHR response)
     *
     * output:
     *  {
     *    count: number; // count of the exactly same duplicities
     *    occurrences: string; // object key(s) where the duplicities occur
     *    item: unknown; // the duplicate data
     *  }[]
     *
     * */
    Object.keys(inputData).forEach((key) => {
      // @ts-ignore
      handleObjValue(inputData[key], key, [key]);
    });
    const parsedData = [...hashes.values()]
      // filter results with less than (5) occurrences // todo: read from command line argument if needed
      .filter((entry) => entry.count > 5)
      // sort from the most to the least occurrences
      .sort((a, b) => b.count - a.count)
      .map((entry) => {
        const duplicatesSizeInBytes = getItemSize(entry.item) * entry.count;
        return {
          ...entry,
          occurrences: Array.from(entry.occurrences),
          sizeInBytes: duplicatesSizeInBytes,
          percentage: ((duplicatesSizeInBytes / fileSizeInBytes) * 100).toFixed(
            2
          ),
        };
      });

    console.info("Parsing ended at: ", new Date().toISOString());

    /** Create a .json file from parsed data */
    const jsonData = parsedData.map((data) => ({
      // display occurrences as "key | otherKey, ..." - better for both JSON visualisation
      count: data.count,
      occurrences: Array.from(data.occurrences),
      lastPath: data.path.join("."),
      item: data.item,
    }));
    const filename = inputPath.split("/")[1];
    fs.writeFileSync(`outputs/${filename}`, JSON.stringify(jsonData));
    console.info(`Created outputs/${filename}`, new Date().toISOString());

    /** Create a .csv file for table view */
    const csvData = jsonData.map((data) => ({
      // display occurrences as "key | otherKey | ..." - createCSV could convert comma-separated values
      count: data.count,
      occurrences: data.occurrences.join(" | "),
      lastPath: data.lastPath,
      itemPreview: JSON.stringify(data.item).slice(0, 60).replace(",", ";"),
    }));
    // **mutates csvData!**
    createCSV(csvData, filename.split(".")[0]);
    console.info(
      `Created outputs/csv/${filename.split(".")[0]}.csv`,
      new Date().toISOString()
    );

    /** Create a console table view of parsed data */
    const tableData = parsedData.map((data) => ({
      count: data.count,
      occurrences: data.occurrences,
      lastPath: data.path.join("."),
      itemPreview: JSON.stringify(data.item).slice(0, 40),
      sizeInBytes: data.sizeInBytes,
      percentage: data.percentage,
    }));
    console.info(
      "\n\n\n==============================SUMMARY==============================\n\n\n"
    );
    console.table(tableData);

    // /** Print aggregated duplicities by occurrence */
    // // fixme - this gets messy with array keys - might be very inaccurate
    // const totalDuplicitiesByType = csvData.reduce(
    //     (acc: { [key: string]: number }, item) => {
    //       if (acc[item.occurrences]) {
    //         return {...acc, [item.occurrences]: acc[item.occurrences] += item.count }
    //       } else {
    //         return { ...acc, [item.occurrences]: item.count }
    //       }
    //     }, {}
    // );
    // console.info(`\n\n\nTOTAL DUPLICITIES BY TYPE:`);
    // console.table(totalDuplicitiesByType);

    // fixme (if possible): counts also parent and children objects => incorrect data interpretation
    /** Print total duplicated objects (incl. arrays) */
    const totalDuplicities = parsedData.reduce(
      (acc, item) => (acc += item.count),
      0
    );
    console.info(`\n\n\n`);
    console.info(`TOTAL DUPLICATED OBJECTS: ${totalDuplicities}`);
    // fixme (if possible): counts also parent and children objects => incorrect data interpretation
    // /** Print total duplicated objects size */
    // const totalDuplicitiesSize = parsedData.reduce(
    //   (acc, item) => (acc += item.sizeInBytes),
    //   0
    // );
    // console.info(`TOTAL DUPLICATED OBJECTS SIZE (B): ${totalDuplicitiesSize}`);
    // console.info(
    //   `TOTAL DUPLICATED OBJECTS SIZE (MB): ${
    //       (totalDuplicitiesSize / (1024 * 1024)).toFixed(2)
    //   }`
    // );
    /** Print total file size in B */
    console.info(`TOTAL FILE SIZE (B): ${fileSizeInBytes}`);
    /** Print total file size in MB */
    console.info(
      `TOTAL FILE SIZE (MB): ${(fileSizeInBytes / (1024 * 1024)).toFixed(2)}`
    );
    // fixme (if possible): counts also parent and children objects => incorrect data interpretation
    // console.info(`TOTAL DUPLICATES PERCENTAGE: ${((totalDuplicitiesSize / fileSizeInBytes) * 100).toFixed(2)}%`);
    console.info(`\n\n\n`);
  }
} else {
  console.error(
    "ERROR: Incorrect or no input file, please insert a .json file located in ./inputs/"
  );
}
