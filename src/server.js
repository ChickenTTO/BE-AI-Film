const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Kéo hàm generateFilm từ đúng file trong thư mục src
const { generateFilm } = require("./controllers/pipelineController");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Nối thẳng đường dẫn API vào hàm xử lý
app.post("/api/generate-film", generateFilm);

app.listen(PORT, () => {
  console.log(`🚀 Hệ thống AI Film đã khởi động trên cổng ${PORT}`);
});