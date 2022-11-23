import * as fs from "fs";
import { createCSV } from "./csv.js";

const hashes = new Map<
  number,
  {
    count: number;
    occurrences: Set<string>;
    item: object;
    path: string[];
  }
>();

// helper to check whether an object does NOT contain any nested objects or arrays of objects
// empty arrays and arrays of primitives are OK
const isPlainObject = (val: { [key: string]: unknown }) =>
  Object.entries(val as { [key: string]: unknown }).every(([_, value]) => {
    if (typeof value === "object" && value != null) {
      if (Array.isArray(value)) {
        // count in objects with nested arrays with primitive values and empty nested arrays ([].every returns true)
        return value.every((item) => item === null || typeof item !== "object");
      } else {
        // found a nested object
        return false;
      }
    }
    return true;
  });

const sortObj = (unordered: object): object =>
  [...Object.keys(unordered)].sort().reduce((obj, key) => {
    // @ts-ignore
    obj[key] = unordered[key];
    return obj;
  }, {});

const getItemSize = (item: object): number => JSON.stringify(item).length;

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

// todo: fix nested objects sorting IF NEEDED (shouldn't be => leaf objects should be always of the same type)
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

const simpleHash = (str: string): number => {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const handleObjValue = (
  val: unknown,
  keyName: string,
  path: string[] = []
): void => {
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
      // handle array
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
};

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
    console.info(`Created outputs/${filename} at: `, new Date().toISOString());

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
      `Created outputs/csv/${filename.split(".")[0]}.csv at: `,
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
    // // fixme - this implementation gets messy with array keys - might be very inaccurate => IF NEEDED: try to hash object keys and aggregate by them
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

    /**
     * Print total number of duplicates found
     * ! might be inaccurate: includes parent objects (and arrays with nested objects) which can have nested duplicates somewhere else
     * */
    const totalDuplicities = parsedData.reduce(
      (acc, item) => (acc += item.count),
      0
    );
    console.info(`\n\n\n`);
    console.info(`TOTAL DUPLICATED OBJECTS: ${totalDuplicities} - *might be inaccurate: includes parent objects`);
    console.info(`\n\n\n`);

    /** Print info about "leaf node object" duplicities */
    const parsedLeafObjects = parsedData.filter(
      (data) =>
        typeof data.item === "object" &&
        !Array.isArray(data.item) &&
        data.item != null &&
        isPlainObject(data.item as { [key: string]: unknown })
    );

    console.table(
      parsedLeafObjects.map((data) => ({
        count: data.count,
        occurrences: data.occurrences,
        lastPath: data.path.join("."),
        itemPreview: JSON.stringify(data.item).slice(0, 40),
        sizeInBytes: data.sizeInBytes,
        percentage: data.percentage,
      }))
    );

    console.info(`\n\n\n`);

    /** Print total duplicated leaf objects */
    const totalLeafDuplicities = parsedLeafObjects.reduce(
        (acc, item) => (acc += item.count),
        0
    );
    const totalLeafDuplicitiesSize = parsedLeafObjects.reduce(
        (acc, item) => (acc += item.sizeInBytes),
        0
    );
    const potentialLeafObjectsSize = parsedLeafObjects.reduce(
        (acc, entry) => (acc += getItemSize(entry.item)),
        0
    );
    const potentialFileSizeReductionPercent = (((totalLeafDuplicitiesSize - potentialLeafObjectsSize) / fileSizeInBytes) * 100).toFixed(2)

    /**
     *
     * Print possible optimizations in a table
     *
     * */
    const currentVsOptimizedTable = {
      currentCount: `${totalLeafDuplicities} items`,
      potentialCount: `${parsedLeafObjects.length} items`,
      currentLeafObjectsSize: `${totalLeafDuplicitiesSize} Bytes`,
      potentialLeafObjectsSize: `${potentialLeafObjectsSize} Bytes`,
      potentialSizeReduction: `${fileSizeInBytes - (totalLeafDuplicitiesSize + potentialLeafObjectsSize)} Bytes`,
      potentialFileSizeReductionPercent: `${potentialFileSizeReductionPercent}%`,
    }

    console.table(currentVsOptimizedTable);

    console.info(`\n\n\n`);

    /** Print count info */
    console.info(`Current leaf object count is ${totalLeafDuplicities} items (leaf objects with duplicities)`);
    console.info(`...of which ${parsedLeafObjects.length} are unique.`);
    console.info('\n');
    /** Print size info */
    console.info(`Current leaf objects size: ${totalLeafDuplicitiesSize}B / ${(totalLeafDuplicitiesSize / (1024 * 1024)).toFixed(2)}MB`);
    console.info(`Total file size: ${fileSizeInBytes}B / ${(fileSizeInBytes / (1024 * 1024)).toFixed(2)}MB`);
    console.info(`Currently the leaf objects with duplicities take up ${((totalLeafDuplicitiesSize / fileSizeInBytes) * 100).toFixed(2)}% of the file size!`);
    console.info('\n');
    console.info(`The file size can be reduced by up to ${potentialFileSizeReductionPercent}% if all duplicities are removed.`);

    console.info(`\n\n\n`);
  }
} else {
  console.error(
    "ERROR: Incorrect or no input file, please insert a .json file located in ./inputs/"
  );
}
