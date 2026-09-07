import assert from "node:assert/strict";
import test from "node:test";
import * as s3 from "./s3.ts";

function file(name, size, type = "application/pdf", lastModified = 1) {
  return { name, size, type, lastModified };
}

test("merges valid PDF selections and explains every rejected file", () => {
  assert.equal(typeof s3.mergePdfSelection, "function");

  const original = file("master.pdf", 10);
  const result = s3.mergePdfSelection(
    [original],
    [
      file("appendix.pdf", 20),
      file("notes.txt", 5, "text/plain"),
      file("oversize.pdf", 101),
      file("MASTER.pdf", 10),
    ],
    { maxFiles: 3, maxBytes: 100 },
  );

  assert.deepEqual(result.files, [original, file("appendix.pdf", 20)]);
  assert.deepEqual(
    result.rejections.map(({ name, code }) => ({ name, code })),
    [
      { name: "notes.txt", code: "type" },
      { name: "oversize.pdf", code: "size" },
      { name: "MASTER.pdf", code: "duplicate" },
    ],
  );
});

test("rejects otherwise valid PDFs after the selection limit is reached", () => {
  const result = s3.mergePdfSelection(
    [file("one.pdf", 10)],
    [file("two.pdf", 10), file("three.pdf", 10)],
    { maxFiles: 2, maxBytes: 100 },
  );

  assert.deepEqual(result.files.map((item) => item.name), ["one.pdf", "two.pdf"]);
  assert.deepEqual(result.rejections.map((item) => item.code), ["limit"]);
});

test("can constrain S3 paths to the remaining document allowance", () => {
  assert.throws(
    () =>
      s3.parseContractPaths(
        "s3://contracts/one.pdf\ns3://contracts/two.pdf",
        1,
      ),
    /no more than 1 document/,
  );
});
