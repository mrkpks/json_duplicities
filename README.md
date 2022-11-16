Note: This is still a WIP!
- needs some error handling
- adjusting cmd line args
- etc.

# RUN
1. `% npm install`
2. `% npx ts-node-esm src/index.ts inputs/<your-input-file>.json`
- do not forget to paste your JSON input file in _./inputs_ folder!

# Description

The **json_duplicities** tool checks for duplicate data in a JSON file - particularly useful when trying to analyze your XHR Responses from the server.

# Inputs & Outputs

Input should be a valid JSON file containing a JSON object.

There are **3** different outputs:

### 1. Command line output
- timestamps 
  - start of parsing the input
  - end of parsing the input
  - .json output created
  - .csv output created

- SUMMARY (table output)
  - same data as in the _./outputs/<name-of-your-input-file>.json_ (see the structure below)
  - this is somewhat restricted since `console.table()` won't show nested object data

- TOTAL DUPLICITIES
  - total number of (various) duplicate items

- DUPLICITIES BY TYPE
  - a table of aggregated duplicities counts per same Object key name (same type/interface just with different values)

### 2. JSON file located in ./outputs/<name-of-your-input-file>.json
This file is of the following structure:
```ts
{
    count: number; // count of the exactly same duplicities
    occurrences: string; // object key(s) where the duplicities occur
    item: unknown; // the duplicate data
}[]
```
For a visualisation, you can try [JSONtoChart.com](https://jsontochart.com/).

### 3. CSV file located in ./outputs/csv/<name-of-your-input-file>.csv

The format is similar to the JSON above - it is just the JSON output data converted into a .csv for (a better) visualization.

You can try either importing it in your favourite spreadsheet tool, such as MS Excel or Google Sheets.

Another way to visualize might be to use [CSVPlot.com](https://www.csvplot.com/).


# Implementation
NOTE: WIP

The implementation consists of _src/index.ts_ and _src/csv.ts_ files.

The _index.ts_ is the main script which consists of some helper functions, accepts the _inputs/<input-file-name>.json_ file as the input to analyze.
If a correct JSON input is provided, the recursive analysis begins to parse all the nested objects and arrays and storing the duplicities within a Map of hashed values.
(- the object keys need to be sorted in order to create the exact same hash, otherwise we'd lose the duplicities!).

When the last item is parsed, the output is written in _./outputs/<input-file-name>.json_. 
After that, the output JSON is converted into a CSV file using helper function from _src/csv.ts_. 
The .csv format should work better for visualizing the data. The file is stored in _./outputs/csv/<input-file-name>.csv_.