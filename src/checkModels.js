require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listMyModels() {
  console.log("🔍 Đang quét danh sách model khả dụng cho API Key của bạn...");
  try {
    const response = await ai.models.list();
    let foundImagen = false;

    for await (const model of response) {
      // Lọc ra những model có chữ "imagen" hoặc "image"
      if (model.name.toLowerCase().includes("veo")) {
        console.log(`🎥 Tìm thấy model tạo video: ${model.name}`);
        foundImagen = true;
      }
    }

    if (!foundImagen) {
      console.log(
        "❌ API Key của bạn hiện KHÔNG CÓ QUYỀN truy cập model Imagen.",
      );
      console.log(
        "💡 Giải pháp: Nếu bạn dùng Credit của Google Cloud, bạn cần chuyển sang dùng Vertex AI thay vì Google AI Studio (Gemini API).",
      );
    }
  } catch (error) {
    console.error("Lỗi khi quét model:", error.message);
  }
}

listMyModels();
