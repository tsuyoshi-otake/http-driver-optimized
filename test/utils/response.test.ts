import {
  responseFormat,
  removeNullValues,
  compileBodyFetchWithContextType,
} from "../../src/utils/index";

describe("responseFormat", () => {
  test("sets ok true for 2xx status", () => {
    const result = responseFormat({
      ok: false, status: 200, data: { result: "success" },
      headers: new Headers(), originalError: null, duration: 50, problem: null,
    });
    expect(result.ok).toBe(true);
  });

  test("sets ok false for non-2xx status", () => {
    const result = responseFormat({
      ok: false, status: 404, data: null,
      headers: new Headers(), originalError: "Not Found", duration: 30, problem: "Not Found",
    });
    expect(result.ok).toBe(false);
    expect(result.problem).toBe("Not Found");
  });
});

describe("removeNullValues", () => {
  test("removes null and undefined from flat object", () => {
    expect(removeNullValues({ a: null, b: 2, c: undefined, d: "ok" }))
      .toEqual({ b: 2, d: "ok" });
  });

  test("recursively processes nested objects, preserves arrays", () => {
    expect(removeNullValues({ a: { b: null, c: 3, d: { e: undefined, f: 4 } }, g: [null, 5, 6] }))
      .toEqual({ a: { c: 3, d: { f: 4 } }, g: [null, 5, 6] });
  });

  test("handles empty object", () => {
    expect(removeNullValues({})).toEqual({});
  });
});

describe("compileBodyFetchWithContextType", () => {
  test("returns JSON string for application/json", () => {
    const payload = { key: "value" };
    expect(compileBodyFetchWithContextType("application/json", payload)).toBe(JSON.stringify(payload));
  });

  test("returns FormData for multipart/form-data", () => {
    const result = compileBodyFetchWithContextType("multipart/form-data", { key: "value" });
    expect(typeof (result as FormData).append).toBe("function");
  });

  test("returns JSON string for unknown content type", () => {
    expect(compileBodyFetchWithContextType("text/plain", { k: "v" })).toBe(JSON.stringify({ k: "v" }));
  });

  test("handles arrays of primitives and nested objects in FormData", () => {
    const payload = {
      name: "file-upload",
      arr: ["one", 2, { inner: "v" }],
      obj: { a: null, b: 2, c: { d: undefined, e: "ok" } },
    };
    const fd = compileBodyFetchWithContextType("multipart/form-data", payload);
    expect(typeof (fd as FormData).append).toBe("function");
  });
});

describe("objectToFormData via compileBodyFetchWithContextType", () => {
  // Mock File-like and Blob-like objects for Node.js environment
  class MockFile {
    name: string;
    lastModified: number;
    size: number;
    type: string;
    constructor(name: string) {
      this.name = name;
      this.lastModified = Date.now();
      this.size = 100;
      this.type = "text/plain";
    }
    stream() { return null; }
    text() { return Promise.resolve(""); }
  }

  class MockBlob {
    size: number;
    type: string;
    constructor() {
      this.size = 50;
      this.type = "application/octet-stream";
    }
    stream() { return null; }
    text() { return Promise.resolve(""); }
  }

  test("handles File-like objects as single values", () => {
    const file = new MockFile("test.txt");
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      document: file,
      name: "test",
    });
    expect(fd).toBeInstanceOf(FormData);
    // FormData in Node.js serializes objects, so check presence
    expect((fd as FormData).has("document")).toBe(true);
    expect((fd as FormData).get("name")).toBe("test");
  });

  test("handles Blob-like objects as single values", () => {
    const blob = new MockBlob();
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      attachment: blob,
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("attachment")).toBe(true);
  });

  test("handles File-like objects inside arrays", () => {
    const file1 = new MockFile("file1.txt");
    const file2 = new MockFile("file2.txt");
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      files: [file1, file2],
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("files[0]")).toBe(true);
    expect((fd as FormData).has("files[1]")).toBe(true);
  });

  test("handles Blob-like objects inside arrays", () => {
    const blob = new MockBlob();
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      blobs: [blob],
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("blobs[0]")).toBe(true);
  });

  test("handles nested objects inside arrays", () => {
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      items: [{ name: "item1" }, { name: "item2" }],
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("items[0].name")).toBe("item1");
    expect((fd as FormData).get("items[1].name")).toBe("item2");
  });

  test("handles primitive values inside arrays", () => {
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      tags: ["alpha", "beta", 3],
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("tags[0]")).toBe("alpha");
    expect((fd as FormData).get("tags[1]")).toBe("beta");
    expect((fd as FormData).get("tags[2]")).toBe("3");
  });

  test("handles nested objects as single values", () => {
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      meta: { author: "John", version: "1.0" },
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("meta.author")).toBe("John");
    expect((fd as FormData).get("meta.version")).toBe("1.0");
  });

  test("handles mixed payload with files, arrays, nested objects, and primitives", () => {
    const file = new MockFile("doc.pdf");
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      title: "Upload",
      file: file,
      tags: ["a", "b"],
      meta: { key: "val" },
      empty: null,
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("title")).toBe("Upload");
    expect((fd as FormData).has("file")).toBe(true);
    expect((fd as FormData).get("tags[0]")).toBe("a");
    expect((fd as FormData).get("meta.key")).toBe("val");
    // null values should be removed by removeNullValues
    expect((fd as FormData).has("empty")).toBe(false);
  });
});

describe("isFileOrBlobLike edge cases via removeNullValues", () => {
  test("preserves objects with constructor name File", () => {
    // Create an object that looks like a native File
    function FakeFile() {}
    Object.defineProperty(FakeFile, 'name', { value: 'File' });
    const file = new (FakeFile as any)();
    file.data = "content";

    const result = removeNullValues({ doc: file, name: "test" });
    // File-like object should be preserved (not recursed into)
    expect(result.doc).toBe(file);
    expect(result.name).toBe("test");
  });

  test("preserves objects with constructor name Blob", () => {
    function FakeBlob() {}
    Object.defineProperty(FakeBlob, 'name', { value: 'Blob' });
    const blob = new (FakeBlob as any)();
    blob.data = "content";

    const result = removeNullValues({ attachment: blob });
    expect(result.attachment).toBe(blob);
  });

  test("regular nested objects are still recursed into", () => {
    const result = removeNullValues({
      meta: { a: null, b: "keep", c: undefined },
    });
    expect(result).toEqual({ meta: { b: "keep" } });
  });
});

describe("isFileOrBlobObject toString branches via FormData", () => {
  test("object with toString returning [object File]", () => {
    const fakeFile = {
      toString: () => "[object File]",
    };
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      doc: fakeFile,
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("doc")).toBe(true);
  });

  test("object with toString returning [object Blob]", () => {
    const fakeBlob = {
      toString: () => "[object Blob]",
    };
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      data: fakeBlob,
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("data")).toBe(true);
  });

  test("object with only text function (Blob-like via hasBlobProps)", () => {
    const blobLike = {
      size: 100,
      type: "text/plain",
      text: () => Promise.resolve("content"),
    };
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      item: blobLike,
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).has("item")).toBe(true);
  });
});

describe("isFileOrBlobLike/isFileOrBlobObject null constructor/toString branches", () => {
  test("object with null constructor (?.name ?? '' fallback)", () => {
    const obj = Object.create(null);
    obj.key = "value";
    // removeNullValues should recurse into this since it has no File/Blob traits
    const result = removeNullValues({ nested: obj });
    expect(result.nested).toEqual({ key: "value" });
  });

  test("FormData with object that has no constructor (null prototype)", () => {
    const obj = Object.create(null);
    obj.field = "value";
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      data: obj,
    });
    expect(fd).toBeInstanceOf(FormData);
    // obj is a plain object without constructor, should be recursed into
    expect((fd as FormData).get("data.field")).toBe("value");
  });

  test("FormData with object that has no toString (?.() ?? '' fallback)", () => {
    // Use a regular object but override toString to undefined
    const obj: any = { size: 100, type: "text/plain" };
    Object.defineProperty(obj, 'toString', { value: undefined });
    Object.defineProperty(obj, 'constructor', { value: undefined });
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      item: obj,
    });
    expect(fd).toBeInstanceOf(FormData);
  });

  test("isFileOrBlobLike returns false for non-object", () => {
    // Passing a primitive through removeNullValues - it won't enter the object branch
    const result = removeNullValues({ a: "string", b: 42, c: true });
    expect(result).toEqual({ a: "string", b: 42, c: true });
  });

  test("FormData array with object that has no constructor", () => {
    // Use regular object but override constructor
    const obj: any = { name: "test" };
    Object.defineProperty(obj, 'constructor', { value: undefined });
    const fd = compileBodyFetchWithContextType("multipart/form-data", {
      items: [obj, "plain"],
    });
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("items[0].name")).toBe("test");
    expect((fd as FormData).get("items[1]")).toBe("plain");
  });
});
