const net = require("node:net");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
  socket.on("data", (data) => {
    const response = getResponse(data);
    socket.write(response);
    socket.end();
  });

  socket.on("close", () => {
    socket.end();
    server.close();
  });
});

server.listen(4221, "localhost");

/**
 * @typedef {Object} HttpRequest
 * @property {string} httpMethod
 * @property {string} target
 * @property {string} httpVersion
 * @property {string[]} headers
 * @property {string} body
 */

/**
 * @param {Buffer} data
 * @returns {HttpRequest}
 */
function parseRequestData(data) {
  const request = data.toString();
  const [head, body] = request.split("\r\n\r\n");
  const [startLine, ...headers] = head.split("\r\n");
  const [httpMethod, target, httpVersion] = startLine.split(" ");

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
});

/**
 * @param {Buffer} data
 * @returns {string}
 */
function getResponse(data) {
  const { target, httpMethod } = parseRequestData(data);
  if (httpMethod === HTTP_METHOD.GET && target === PATH.ROOT)
    return "HTTP/1.1 200 OK\r\n\r\n";

  if (httpMethod === HTTP_METHOD.GET && target.match(PATH.ECHO)) {
    return getEchoResponse(data);
  }

  return "HTTP/1.1 404 Not Found\r\n\r\nNo encontrado";
}

/**
 * @param {Buffer} data
 * @returns {string}
 */
function getEchoResponse(data) {
  const { target } = parseRequestData(data);
  const message = target.replace(/^\/echo\//, "");
  const body = decodeURIComponent(message);
  const bodyLength = Buffer.byteLength(body);

  const startLine = "HTTP/1.1 200 OK\r\n";
  const headers = [
    "Content-Type: text/plain\r\n",
    `Content-Length: ${bodyLength}\r\n`,
  ];
  const emptyLine = "\r\n";

  const response = [startLine, ...headers, emptyLine, body].join("");
  return response;
}
