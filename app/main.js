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

/**
 * @param {Buffer} data
 * @returns {string}
 */
function getResponse(data) {
  const { target } = parseRequestData(data);
  if (target === "/") return "HTTP/1.1 200 OK\r\n\r\n";
  return "HTTP/1.1 404 Not Found\r\n\r\n";
}
