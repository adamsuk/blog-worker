// Function to parse metadata from a markdown file
export const parseMarkdownMetadata = markdown => {
  // Regular expression to match metadata at the beginning of the file
  const metadataRegex = /^---([\s\S]*?)---/;
  const metadataMatch = markdown.match(metadataRegex);

  // If there is no metadata, return an empty object
  if (!metadataMatch) {
    return {};
  }

  // Split the metadata into lines
  const metadataLines = metadataMatch[1].split("\n");

  // Use reduce to accumulate the metadata as an object
  const metadata = metadataLines.reduce((acc, line) => {
    // Split the line into key-value pairs
    const [key, value] = line.split(":").map(part => part.trim());
    // If the line is not empty add the key-value pair to the metadata object
    if(key) acc[key] = value;
    return acc;
  }, {});

  // Return the metadata object
  return metadata;
};