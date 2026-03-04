const express = require("express");
const router = express.Router();
const { generateFilm } = require("../controllers/pipelineController");

router.post("/generate", generateFilm);

module.exports = router;
