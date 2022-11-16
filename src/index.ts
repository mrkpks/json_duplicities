import * as fs from "fs";
import { createCSV } from "./csv.js";

const hashes = new Map<
  number,
  { count: number; occurrences: Set<string>; item: object }
>();

function sortObj(unordered: object): object {
  return [...Object.keys(unordered)].sort().reduce((obj, key) => {
    // @ts-ignore
    obj[key] = unordered[key];
    return obj;
  }, {});
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

function handleObjValue(val: unknown, keyName: string): void {
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
      });
    } else {
      hashes.set(hash, {
        count: 1,
        occurrences: new Set("").add(keyName),
        item: val as object | unknown[],
      });
    }
    Object.keys(val as object).forEach((key) => {
      // handle array // todo: array is also an object so it can be combined - decide if we need to treat arrays differently
      if (Array.isArray(val)) {
        handleObjValue((val as unknown[])[key as unknown as number], key);
      } else {
        // handle an object
        // @ts-ignore
        handleObjValue((val as object)[key], key);
      }
    });
  }
}

const inputPath = process.argv.find((arg) => arg.includes(".json"));

if (inputPath) {
  const inputData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  if (inputData) {
    console.info("Parsing started at: ", new Date().toISOString());
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
      handleObjValue(inputData[key], key);
    });
    const data = [...hashes.values()]
        // filter results with less than (5) occurrences // todo: read from command line argument if needed
      .filter((item) => item.count > 5)
      // sort from the most to the least occurrences
      .sort((a, b) => b.count - a.count)
      .map((data) => ({
        ...data,
        // display occurrences as "key, otherKey, ..." - better for both JSON and CSV visualisation
        occurrences: Array.from(data.occurrences).join(", "),
      }));

    console.info("Parsing ended at: ", new Date().toISOString());

    const filename = inputPath.split("/")[1];

    fs.writeFileSync(`outputs/${filename}`, JSON.stringify(data));
    console.info(`Created outputs/${filename}`, new Date().toISOString());

    /** Create a .csv file for table view */

    // re-map "item" object to string so that it won't create unique paths
    const csvData = data.map((entry) => ({
      ...entry,
      // display occurrences as "key | otherKey | ..." - createCSV could convert comma-separated values
      occurrences: entry.occurrences.replace(", ", " | "),
      item: JSON.stringify(entry.item)
        // .replace("{", "")
        // .replace("}", "")
        .replace(",", ";"),
    }));
    createCSV(csvData, filename.split(".")[0]);
    console.info(
      `Created outputs/csv/${filename.split(".")[0]}.csv`,
      new Date().toISOString()
    );

    console.info(
      "\n\n\n==============================SUMMARY==============================\n\n\n"
    );
    // console.table(
    //   data.map((entry) => ({
    //     ...entry,
    //     item:
    //       typeof entry.item === "object" && !Array.isArray(entry.item)
    //         ? JSON.stringify(entry.item)
    //         : entry.item,
    //   }))
    // );
    console.table(data);
    const totalDuplicitiesByType = csvData.reduce(
        (acc: { [key: string]: number }, item) => {
          if (acc[item.occurrences]) {
            return {...acc, [item.occurrences]: acc[item.occurrences] += item.count }
          } else {
            return { ...acc, [item.occurrences]: item.count }
          }
        }, {}
    );
    const totalDuplicities = csvData.reduce(
      (acc, item) => (acc += item.count),
      0
    );
    console.info(`\n\n\nTOTAL DUPLICITIES: ${totalDuplicities}\n\n\n`);
    console.info(`\n\n\nTOTAL DUPLICITIES BY TYPE:`);
    console.table(totalDuplicitiesByType);
  }
} else {
  console.error(
    "ERROR: Incorrect or no input file, please insert a .json file located in ./inputs/"
  );
}
