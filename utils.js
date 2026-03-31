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

  let sortDir = "asc";
  let sortDirSource = "default";

  if (Array.isArray(data)) {
    // Check parent file (e.g. cv.experience.md) for sort direction
    if (prefix) {
      const parentFile = data.find(({ name }) => name === `${prefix}.md`);
      if (parentFile) {
        const { data: parentData, status: parentStatus } = await app(
          `GET /repos/adamsuk/dendron-daily/contents/${parentFile.path}`
        );
        if (parentStatus === 200) {
          const parentParsed = parseMarkdownMetadata(parentData);
          if (parentParsed.meta?.sort) {
            sortDir = parentParsed.meta.sort;
            sortDirSource = "parent-file";
          }
        }
      }
    }

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
          if (parsed.meta && parsed.meta.public === true) {
            const slug = parsed.meta.slug || name.replace(/\.md$/, "");
            res.push({ name, path, slug, ...parsed });
          }
        }
      })
    );
  }

  return { items: res, sortDir, sortDirSource };
};
