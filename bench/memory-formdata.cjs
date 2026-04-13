const { performance } = require("node:perf_hooks");

const GROUP_COUNT = Number(process.env.BENCH_FORMDATA_GROUP_COUNT ?? 220);
const ITEMS_PER_GROUP = Number(process.env.BENCH_FORMDATA_ITEMS_PER_GROUP ?? 8);
const ITERATIONS = Number(process.env.BENCH_FORMDATA_ITERATIONS ?? 5);

function toMiB(value) {
  return Number((value / (1024 * 1024)).toFixed(2));
}

function isFileOrBlob(value) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  const hasFileProps = typeof v.name === "string" && typeof v.lastModified === "number";
  const hasBlobProps = typeof v.size === "number" && typeof v.type === "string"
    && (typeof v.stream === "function" || typeof v.text === "function");

  if (hasFileProps || hasBlobProps) return true;

  const ctorName = v.constructor?.name ?? "";
  const str = typeof v.toString === "function" ? v.toString() : "";
  return ctorName === "File" || ctorName === "Blob"
    || str === "[object File]" || str === "[object Blob]";
}

function removeNullValues(obj) {
  const result = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      if (typeof value === "object" && !Array.isArray(value)) {
        result[key] = isFileOrBlob(value) ? value : removeNullValues(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

function estimateSerializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function createTracker() {
  let peakIntermediateBytes = 0;

  return {
    recordIntermediateBytes(value) {
      if (value > peakIntermediateBytes) {
        peakIntermediateBytes = value;
      }
    },
    peakIntermediateBytes() {
      return peakIntermediateBytes;
    },
  };
}

class CountingFormData {
  constructor() {
    this.entryCount = 0;
  }

  append() {
    this.entryCount += 1;
  }
}

function legacyObjectToFormData(payload, tracker, formData = new CountingFormData(), parentKey = null) {
  if (parentKey === null) {
    payload = removeNullValues(payload);
    tracker.recordIntermediateBytes(estimateSerializedBytes(payload));
  }

  for (const key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;

    const value = payload[key];
    const formKey = parentKey ? `${parentKey}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((subValue, index) => {
        if (isFileOrBlob(subValue)) {
          formData.append(`${formKey}[${index}]`, subValue);
        } else if (typeof subValue === "object" && subValue !== null) {
          legacyObjectToFormData(subValue, tracker, formData, `${formKey}[${index}]`);
        } else {
          formData.append(`${formKey}[${index}]`, String(subValue));
        }
      });
    } else if (isFileOrBlob(value)) {
      formData.append(formKey, value);
    } else if (typeof value === "object" && value !== null) {
      legacyObjectToFormData(value, tracker, formData, formKey);
    } else {
      formData.append(formKey, String(value));
    }
  }

  return formData;
}

function optimizedObjectToFormData(
  payload,
  tracker,
  formData = new CountingFormData(),
  parentKey = null,
  skipNullish = true
) {
  if (parentKey === null) {
    tracker.recordIntermediateBytes(0);
  }

  for (const key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;

    const value = payload[key];
    if (skipNullish && (value === null || value === undefined)) continue;

    const formKey = parentKey ? `${parentKey}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((subValue, index) => {
        if (isFileOrBlob(subValue)) {
          formData.append(`${formKey}[${index}]`, subValue);
        } else if (typeof subValue === "object" && subValue !== null) {
          optimizedObjectToFormData(subValue, tracker, formData, `${formKey}[${index}]`, false);
        } else {
          formData.append(`${formKey}[${index}]`, String(subValue));
        }
      });
    } else if (isFileOrBlob(value)) {
      formData.append(formKey, value);
    } else if (typeof value === "object" && value !== null) {
      optimizedObjectToFormData(value, tracker, formData, formKey, skipNullish);
    } else {
      formData.append(formKey, String(value));
    }
  }

  return formData;
}

function createPayload() {
  const payload = {};

  for (let groupIndex = 0; groupIndex < GROUP_COUNT; groupIndex += 1) {
    payload[`section_${groupIndex}`] = {
      title: `section-${groupIndex}-${"x".repeat(96)}`,
      description: groupIndex % 3 === 0 ? null : `desc-${"d".repeat(64)}`,
      meta: {
        owner: `owner-${groupIndex}`,
        note: groupIndex % 2 === 0 ? undefined : `note-${"n".repeat(64)}`,
        flags: {
          active: groupIndex % 2 === 0,
          archived: null,
        },
      },
      tags: Array.from({ length: ITEMS_PER_GROUP }, (_, itemIndex) =>
        itemIndex % 3 === 0 ? null : `tag-${groupIndex}-${itemIndex}-${"t".repeat(24)}`
      ),
      rows: Array.from({ length: ITEMS_PER_GROUP }, (_, itemIndex) => ({
        id: `${groupIndex}-${itemIndex}`,
        label: `label-${groupIndex}-${itemIndex}-${"l".repeat(48)}`,
        optional: itemIndex % 2 === 0 ? null : `opt-${itemIndex}`,
        nested: {
          enabled: itemIndex % 2 === 0,
          hint: itemIndex % 4 === 0 ? undefined : `hint-${"h".repeat(48)}`,
        },
      })),
    };
  }

  return payload;
}

function measureCase(name, runner) {
  let totalDurationMs = 0;
  let totalPeakIntermediateBytes = 0;
  let entryCount = 0;

  for (let index = 0; index < ITERATIONS; index += 1) {
    const tracker = createTracker();
    const startedAt = performance.now();
    const formData = runner(createPayload(), tracker);
    totalDurationMs += performance.now() - startedAt;
    totalPeakIntermediateBytes += tracker.peakIntermediateBytes();
    entryCount = formData.entryCount;
  }

  return {
    benchmark: name,
    iterations: ITERATIONS,
    groups: GROUP_COUNT,
    itemsPerGroup: ITEMS_PER_GROUP,
    entryCount,
    avgMs: Number((totalDurationMs / ITERATIONS).toFixed(2)),
    avgIntermediateCloneMiB: toMiB(totalPeakIntermediateBytes / ITERATIONS),
  };
}

function main() {
  const results = [
    measureCase("legacy.objectToFormData", legacyObjectToFormData),
    measureCase("optimized.objectToFormData", optimizedObjectToFormData),
  ];

  console.table(results);
  console.log(JSON.stringify(results, null, 2));
}

main();
