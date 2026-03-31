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

// Fetch markdown files from the flat notes/ directory in dendron-daily, filtered by prefix
export const getMarkdown = async (app, prefix, res = []) => {
  const { data, status } = await app(
    `GET /repos/adamsuk/dendron-daily/contents/notes`
  );

  // Maps file prefix (name without .md) to its sort/order metadata.
  // Built from every fetched file so nested section parents contribute their
  // sort direction even when not public.
  const sortDirMap = {};

  if (Array.isArray(data)) {
    const matching = data.filter(
      ({ name }) =>
        (prefix ? name.startsWith(`${prefix}.`) : true) && name.endsWith(".md")
    );
    await Promise.all(
      matching.map(async ({ name, path }) => {
        const { data: fileData, status: fileStatus } = await app(
          `GET /repos/adamsuk/dendron-daily/contents/${path}`
        );
        if (fileStatus === 200) {
          const parsed = parseMarkdownMetadata(fileData);

          // Capture sort/order from every file for hierarchical sorting
          const filePrefix = name.slice(0, -3);
          const entry = {};
          if (parsed.meta?.sort != null) entry.sort = parsed.meta.sort;
          if (parsed.meta?.order != null) entry.order = parsed.meta.order;
          if (Object.keys(entry).length > 0) sortDirMap[filePrefix] = entry;

          if (parsed.meta && parsed.meta.public === true) {
            const slug = parsed.meta.slug || name.replace(/\.md$/, "");
            res.push({ name, path, slug, ...parsed });
          }
        }
      })
    );
  }

  return { items: res, sortDirMap };
};
