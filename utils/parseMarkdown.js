export function parseMarkdown(markdown) {
  const headings = {};

  markdown = markdown.replaceAll('\r','');
  const lines = markdown.split('\n');
  let currentHeading = '';
  let processingTaskList = false;

  for (const line of lines) {
    if (processingTaskList) {
      const endTasklistMatch = line.match(/^```(.*)/);
      if (endTasklistMatch) processingTaskList = false;
      continue;
    }
    const startTasklistMatch = line.match(/^```\[tasklist\]/);
    if (startTasklistMatch) {
      processingTaskList = true;
      continue;
    }
    const headingMatch = line.match(/^#+\s+(.*)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      currentHeading = headingText.replace(/\s+$/, '');
      headings[currentHeading] = '';
    } else {
      if (currentHeading && line.trim().length > 0) {
        headings[currentHeading] += headings[currentHeading] ? "," + line.trim() : line.trim();
      }
    }
  }

  // iterate through and tidy up response object
  for (const heading in headings) {
    // Trim whitespace from property values
    headings[heading] = headings[heading].trim();

    // Strip out empty fields/properties
    if (headings[heading] === '_No response_') {
      delete headings[heading];
    }
  }

  return headings;
}

/*
on issue add to board

fetch issue
parse body

fetch fields for current project

for each field from body
  if project fields includes body field
    switch (field type)
      text
        project field value = body field value
      number
        project field value = int.parse(body field value)
      date
        project field value = date.parse(body field value)
      single select
        find match from field definition
      iteration
        ???
*/
