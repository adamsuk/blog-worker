import YAML from "yaml";

// Function to parse metadata from a markdown file
export const parseMarkdownMetadata = (markdown) => {
  // Regular expression to match metadata at the beginning of the file
  const metadataRegex = /^---([\s\S]*?)---/;
  const metadataMatch = markdown.match(metadataRegex);
  const content = markdown.replace(metadataMatch, "");

  // If there is no metadata, return an empty object
  if (!metadataMatch) {
    return { meta: {}, content };
  }

  // Split the metadata into lines
  const metadataLines = metadataMatch[1].split("\n");

  const meta = YAML.parse(metadataMatch[1]);

  // Return the metadata object
  return { meta, content };
};

// Sort items hierarchically by section order and each section's sort direction.
// Moved unchanged from worker.js.
export const sortItems = (items, sortDirMap, prefix) => {
  // Returns the first path segment below the base prefix (the "root section"),
  // and whether this item IS that section header (a direct child of prefix).
  // e.g. prefix="cv", name="cv.experience.job1.md"
  //   → { rootSection: "experience", isDirectChild: false }
  // e.g. prefix="cv", name="cv.experience.md"
  //   → { rootSection: "experience", isDirectChild: true }
  function segInfo(name) {
    const noMd = name.slice(0, -3);
    const after = prefix ? noMd.slice(prefix.length + 1) : noMd;
    const dot = after.indexOf(".");
    return dot === -1
      ? { rootSection: after, isDirectChild: true }
      : { rootSection: after.slice(0, dot), isDirectChild: false };
  }

  function orderCmp(aOrder, bOrder, aItem, bItem) {
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    if (aOrder !== null) return -1;
    if (bOrder !== null) return 1;
    return aItem.path.localeCompare(bItem.path);
  }

  items.sort((a, b) => {
    const ai = segInfo(a.name);
    const bi = segInfo(b.name);

    if (ai.rootSection !== bi.rootSection) {
      // Cross-section: sort sections by their own order field
      const aKey = prefix ? `${prefix}.${ai.rootSection}` : ai.rootSection;
      const bKey = prefix ? `${prefix}.${bi.rootSection}` : bi.rootSection;
      const aOrder = sortDirMap[aKey]?.order ?? null;
      const bOrder = sortDirMap[bKey]?.order ?? null;
      const topDir = sortDirMap[prefix]?.sort || "asc";
      const cmp = orderCmp(aOrder, bOrder, a, b);
      return topDir === "desc" ? -cmp : cmp;
    }

    // Same section: section header always appears before its children
    if (ai.isDirectChild !== bi.isDirectChild) {
      return ai.isDirectChild ? -1 : 1;
    }

    // Same section, same depth: sort by order using this section's sort direction
    const sectionKey = prefix
      ? `${prefix}.${ai.rootSection}`
      : ai.rootSection;
    const dir = ai.isDirectChild
      ? sortDirMap[prefix]?.sort || "asc"
      : sortDirMap[sectionKey]?.sort || "asc";
    const cmp = orderCmp(
      a.meta?.order ?? null,
      b.meta?.order ?? null,
      a,
      b
    );
    return dir === "desc" ? -cmp : cmp;
  });
  return items;
};
