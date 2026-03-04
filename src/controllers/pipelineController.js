require("dotenv").config();
const { GoogleGenAI, Type } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ⏱️ HÀM DELAY: Giúp tạm dừng vòng lặp để không bị dính Rate Limit
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// BƯỚC 1: TẠO KỊCH BẢN (GEMINI)
// ==========================================
async function generateScriptWithGemini(userPrompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: `Viết kịch bản phim ngắn cho ý tưởng: ${userPrompt}`,
    config: {
      systemInstruction:
        "Bạn là Đạo diễn AI. Phân rã ý tưởng thành các cảnh. Viết nanoImagePrompt và veoMotionPrompt tiếng Anh cực kỳ chi tiết cho mỗi cảnh.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          filmTitle: { type: Type.STRING },
          artStyle: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                narrative: { type: Type.STRING },
                nanoImagePrompt: { type: Type.STRING },
                veoMotionPrompt: { type: Type.STRING },
                audioCue: { type: Type.STRING },
              },
              required: [
                "sceneNumber",
                "narrative",
                "nanoImagePrompt",
                "veoMotionPrompt",
                "audioCue",
              ],
            },
          },
        },
        required: ["filmTitle", "artStyle", "scenes"],
      },
    },
  });
  return JSON.parse(response.text);
}

// ==========================================
// BƯỚC 2: TẠO HÌNH ẢNH (CÓ CHỐNG RATE LIMIT)
// ==========================================
async function createStoryboards(scriptData) {
  console.log(`🎨 Đang vẽ ảnh bằng Imagen 4.0 Ultra...`);
  const keyframes = [];

  for (let i = 0; i < scriptData.scenes.length; i++) {
    const scene = scriptData.scenes[i];
    try {
      console.log(`   -> Đang vẽ cảnh ${scene.sceneNumber}...`);

      const response = await ai.models.generateImages({
        model: "imagen-4.0-generate-001",
        prompt: scene.nanoImagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "16:9",
        },
      });

      const base64Image = response.generatedImages[0].image.imageBytes;

      if (base64Image) {
        keyframes.push(`data:image/jpeg;base64,${base64Image}`);
      } else {
        throw new Error("Imagen không trả về dữ liệu ảnh.");
      }

      // ⏳ CHỐNG RATE LIMIT: Nghỉ 15 giây sau mỗi ảnh (trừ ảnh cuối cùng)
      if (i < scriptData.scenes.length - 1) {
        console.log(
          `   ⏳ Đang chờ 15s để làm mát API (tránh lỗi 429 Quota)...`,
        );
        await delay(15000);
      }
    } catch (error) {
      console.error(
        `❌ Lỗi vẽ ảnh ở cảnh ${scene.sceneNumber}:`,
        error.message,
      );
      throw new Error(
        `Tạo ảnh thất bại tại cảnh ${scene.sceneNumber}: ${error.message}`,
      );
    }
  }

  return keyframes;
}

// ==========================================
// HÀM ĐIỀU PHỐI PIPELINE CHÍNH
// ==========================================
const generateFilm = async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  console.log(`\n🔥 [AI PIPELINE] BẮT ĐẦU: "${prompt}"`);

  try {
    console.log("🧠 1. Gọi Gemini viết kịch bản...");
    const scriptData = await generateScriptWithGemini(prompt);

    console.log("🎨 2. Gọi Imagen vẽ Storyboard...");
    const keyframes = await createStoryboards(scriptData);

    console.log("🎥 3. Gọi Veo 2.0 để render Video...");
    const base64ImageData = keyframes[0].replace(
      /^data:image\/\w+;base64,/,
      "",
    );

    // 1. GỬI YÊU CẦU ĐỂ LẤY "BIÊN LAI" (OPERATION)
    const videoResponse = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      prompt: scriptData.scenes[0]?.veoMotionPrompt || prompt,
      config: {
        inputFrames: [
          {
            mimeType: "image/jpeg",
            imageBytes: base64ImageData,
          },
        ],
        outputMimeType: "video/mp4",
        aspectRatio: "16:9",
      },
    });

    const operationName = videoResponse.name;
    if (!operationName) {
      throw new Error(
        "Không nhận được Mã tiến trình (Operation Name) từ Veo API.",
      );
    }

    console.log(`   -> Đã lấy được biên lai. Mã tiến trình: ${operationName}`);
    console.log(
      `   -> Đang chờ Google Veo render video (Quá trình này có thể mất 1 - 3 phút)...`,
    );

    let videoUrl = "";
    let isDone = false;

    // 2. VÒNG LẶP KIỂM TRA (POLLING) MỖI 15 GIÂY
    while (!isDone) {
      await delay(15000);
      console.log(`   ⏳ Đang kiểm tra tiến trình...`);

      const checkRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${process.env.GEMINI_API_KEY}`,
      );
      const checkData = await checkRes.json();

      if (checkData.done) {
        isDone = true;

        if (checkData.error) {
          throw new Error(
            `Lỗi render từ Google Veo: ${checkData.error.message}`,
          );
        }

        // Bóc tách video
        if (checkData.response && checkData.response.generateVideoResponse) {
          const samples =
            checkData.response.generateVideoResponse.generatedSamples;
          if (samples && samples.length > 0) {
            const rawUri = samples[0].video?.uri;
            if (rawUri) {
              videoUrl = `${rawUri}&key=${process.env.GEMINI_API_KEY}`;
            }
          }
        }
      } else {
        console.log(`   -> Video vẫn đang được render, vui lòng đợi thêm...`);
      }
    }

    if (!videoUrl) {
      throw new Error(
        "Veo chạy xong nhưng không tìm thấy dữ liệu Video hợp lệ.",
      );
    }
    console.log("✅ Render video bằng Google Veo thành công!");
    res.json({
      success: true,
      data: {
        videoUrl,
        audioUrl: "https://www.w3schools.com/html/horse.mp3",
        keyframes,
        script: scriptData,
      },
    });
  } catch (error) {
    console.error("❌ Pipeline error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { generateFilm };
