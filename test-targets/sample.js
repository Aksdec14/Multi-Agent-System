// Deliberately vulnerable sample for security scanner testing
// DO NOT use any of these patterns in production

const express = require("express");
const sql = require("mysql2");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.urlencoded({ extended: true }));

const DB_PASSWORD = "admin123";
const JWT_SECRET = "supersecretkey123";

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
  sql.query(query, (err, results) => {
    if (results.length > 0) {
      const token = jwt.sign({ user: username }, JWT_SECRET);
      res.json({ token });
    } else {
      res.status(401).send("Invalid credentials");
    }
  });
});

app.get("/profile", (req, res) => {
  const userId = req.query.id;
  const filePath = `./uploads/${userId}`;
  const content = require("fs").readFileSync(filePath, "utf-8");
  res.send(content);
});

app.get("/search", (req, res) => {
  const term = req.query.q;
  res.send(`<h1>Results for: ${term}</h1>`);
});

app.post("/upload", (req, res) => {
  const filename = req.body.filename;
  require("fs").writeFileSync(`./uploads/${filename}`, req.body.data);
  res.send("Uploaded");
});

app.get("/admin", (req, res) => {
  // No auth check
  res.json({ users: ["admin", "user1", "user2"] });
});

app.get("/api/data", (req, res) => {
  const cmd = req.query.cmd;
  require("child_process").exec(cmd, (err, stdout) => {
    res.send(stdout);
  });
});

eval(req.query.code);

app.listen(3000);
