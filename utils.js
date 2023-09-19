// Function to parse metadata from a markdown file
export const parseMarkdownMetadata = markdown => {
  // Regular expression to match metadata at the beginning of the file
  const metadataRegex = /^---([\s\S]*?)---/;
  const metadataMatch = markdown.match(metadataRegex);
  const content = markdown.replace(metadataMatch, "")

  // If there is no metadata, return an empty object
  if (!metadataMatch) {
    return { meta: {}, content };
  }

  // Split the metadata into lines
  const metadataLines = metadataMatch[1].split("\n");

  // Use reduce to accumulate the metadata as an object
  const meta = metadataLines.reduce((acc, line) => {
    // Split the line into key-value pairs
    const [key, value] = line.split(":").map(part => part.trim());
    // If the line is not empty add the key-value pair to the metadata object
    if(key) acc[key] = value;
    return acc;
  }, {});

  // Return the metadata object
  return { meta, content };
};

export const getMarkdown = async (app, path, res=[]) => {
  const { data, status } = await app(`GET /repos/adamsuk/blog/contents/${path}`);

  if (Array.isArray(data)) {
    var children = data.map(({name, path}) => ({ name, path }))

    children = await Promise.all(children.map(async (child) => {
      return getMarkdown(app, child.path, res)
    }))
    return [ ...res, ...children ]
  } else if (path.endsWith('.md') && status === 200) {
    res.push(parseMarkdownMetadata(data))
  }
  return res
}