const net = require("node:net");
const { readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

const args = process.argv;

const directoryPath = getDirectoryPath();

/**
 * @returns {string | undefined}
 */
function getDirectoryPath() {
  const directoryArgIndex = args.findIndex((arg) => "--directory" === arg);
  if (directoryArgIndex === -1) return;
  const directoryPath = args[directoryArgIndex + 1];
  return directoryPath;
}

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  socket.on("data", async (data) => {
    const response = await getResponse(data);
    socket.write(response);
    socket.end();
  });

  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");

/**
 * @typedef {Object} HttpRequest
 * @property {string} httpMethod
 * @property {string} target
 * @property {string} httpVersion
 * @property {[string, string][]} headers
 * @property {string} body
 */

/**
 * @param {Buffer} data
 * @returns {HttpRequest}
 */
function parseRequestData(data) {
  const request = data.toString();
  const [head, body] = request.split("\r\n\r\n");
  const [startLine, ...rawHeaders] = head.split("\r\n");
  const [httpMethod, target, httpVersion] = startLine.split(" ");
  const headers = rawHeaders.map((header) => header.split(": "));

  return {
    httpMethod,
    target,
    httpVersion,
    headers,
    body,
  };
}

const HTTP_METHOD = Object.freeze({
  GET: "GET",
  POST: "POST",
});

const PATH = Object.freeze({
  ROOT: "/",
  ECHO: Object.freeze(/^\/echo\//),
  USER_AGENT: "/user-agent",
  FILES: Object.freeze(/^\/files\//),
});

const HEADER = Object.freeze({
  USER_AGENT: "User-Agent",
  CONTENT_TYPE: "Content-Type",
  CONTENT_LENGTH: "Content-Length",
});

const CONTENT_TYPE = Object.freeze({
  TEXT: "text/plain",
  FILE: "application/octet-stream",
});

const HTTP_STATUS = Object.freeze({
  OK: "OK",
  CREATED: "CREATED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
});

const RESPONSE_START_LINE = Object.freeze({
  OK: "HTTP/1.1 200 OK\r\n",
  CREATED: "HTTP/1.1 201 Created\r\n",
  NOT_FOUND: "HTTP/1.1 404 Not Found\r\n",
  INTERNAL_SERVER_ERROR: "HTTP/1.1 500 Internal Server Error\r\n",
});

/**
 * @param {Buffer} data
 * @returns {string}
 */
async function getResponse(data) {
  const httpRequest = parseRequestData(data);
  const { target, httpMethod } = httpRequest;

  if (httpMethod === HTTP_METHOD.GET && target === PATH.ROOT) {
    return getRootResponse(httpRequest);
  }

  if (httpMethod === HTTP_METHOD.GET && target.match(PATH.ECHO)) {
    return getEchoResponse(httpRequest);
  }

  if (httpMethod === HTTP_METHOD.GET && target === PATH.USER_AGENT) {
    return getUserAgentResponse(httpRequest);
  }

  if (httpMethod === HTTP_METHOD.GET && target.match(PATH.FILES)) {
    return await getFilesResponse(httpRequest);
  }

  if (httpMethod === HTTP_METHOD.POST && target.match(PATH.FILES)) {
    return await getSaveFilesResponse(httpRequest);
  }

  return getNotFoundResponse(httpRequest);
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function generateHeader(key, value) {
  return `${key}: ${value}\r\n`;
}

/**
 * @param {Object} params
 * @param {string} params.httpStatus
 * @param {[string, string][]} [params.headers=[]]
 * @returns {string}
 */
function generateResponse({ httpStatus, headers = [], body = "" }) {
  const startLine = RESPONSE_START_LINE[httpStatus];

  const responseHeaders = headers.map(([key, value]) =>
    generateHeader(key, value)
  );

  const emptyLine = "\r\n";

  const response = [startLine, ...responseHeaders, emptyLine, body].join("");

  return response;
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {string}
 */
function getRootResponse(httpRequest) {
  return generateResponse({ httpStatus: HTTP_STATUS.OK });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {string}
 */
function getNotFoundResponse(httpRequest) {
  return generateResponse({ httpStatus: HTTP_STATUS.NOT_FOUND });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {string}
 */
function getInternalServerErrorResponse(httpRequest) {
  return generateResponse({ httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {string}
 */
function getEchoResponse(httpRequest) {
  const { target } = httpRequest;
  const message = target.replace(PATH.ECHO, "");
  const body = decodeURIComponent(message);
  const bodyLength = Buffer.byteLength(body);

  const headers = [
    [HEADER.CONTENT_TYPE, CONTENT_TYPE.TEXT],
    [HEADER.CONTENT_LENGTH, bodyLength],
  ];

  return generateResponse({ httpStatus: HTTP_STATUS.OK, headers, body });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {string}
 */
function getUserAgentResponse(httpRequest) {
  const { headers } = httpRequest;
  const [, userAgent = ""] = headers.find(([key]) => key === HEADER.USER_AGENT);
  const body = userAgent;
  const bodyLength = Buffer.byteLength(body);

  const responseHeaders = [
    [HEADER.CONTENT_TYPE, CONTENT_TYPE.TEXT],
    [HEADER.CONTENT_LENGTH, bodyLength],
  ];

  return generateResponse({
    httpStatus: HTTP_STATUS.OK,
    headers: responseHeaders,
    body,
  });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {Promise<string>}
 */
async function getFilesResponse(httpRequest) {
  const { target } = httpRequest;
  const filename = target.replace(PATH.FILES, "");
  const file = await getFile(filename);
  if (!file) return getNotFoundResponse(httpRequest);

  const body = file;
  const bodyLength = body.byteLength;

  const responseHeaders = [
    [HEADER.CONTENT_TYPE, CONTENT_TYPE.FILE],
    [HEADER.CONTENT_LENGTH, bodyLength],
  ];

  return generateResponse({
    httpStatus: HTTP_STATUS.OK,
    headers: responseHeaders,
    body,
  });
}

/**
 * @param {HttpRequest} httpRequest
 * @returns {Promise<string>}
 */
async function getSaveFilesResponse(httpRequest) {
  const { target } = httpRequest;
  const filename = target.replace(PATH.FILES, "");
  const isSaved = await saveFile(filename, httpRequest.body);

  if (!isSaved) return getInternalServerErrorResponse(httpRequest);

  return generateResponse({ httpStatus: HTTP_STATUS.CREATED });
}

/**
 * @param {string} filename
 * @returns {Promise<Buffer | null>}
 */
async function getFile(filename) {
  const path = join(directoryPath, filename);
  const file = await readFile(path).catch(() => null);
  return file;
}

/**
 * @param {string} filename
 * @returns {Promise<boolean>}
 */
async function saveFile(filename, content) {
  try {
    const filePath = join(directoryPath, filename);
    await writeFile(filePath, content);
  } catch {
    return false;
  }
  return true;
}
