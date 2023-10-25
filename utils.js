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

// Recursive method of obtaining markdown files from a repo
export const getMarkdown = async (app, path, res = [], obj = {}) => {
  const { data, status } = await app(
    `GET /repos/adamsuk/blog/contents/${path}`
  );

  if (Array.isArray(data)) {
    var children = data.map(({ name, path }) => ({ name, path }));

    children = await Promise.all(
      children.map(async (child) => {
        return getMarkdown(app, child.path, res, child);
      })
    );
  } else if (path.endsWith(".md") && status === 200) {
    res.push({ ...obj, ...parseMarkdownMetadata(data) });
  }
  return res;
};
