import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function formatText(input: string) {
  if (!input.trim()) return "";

  const prompt = `
    Anda adalah seorang editor buku profesional. Tugas Anda adalah merapikan teks berikut agar sesuai dengan standar penulisan buku yang rapi dan mudah dibaca.
    
    Tujuan format:
    1. Pastikan ada Judul Utama (Headings 1).
    2. Sub-judul yang jelas (Headings 2 atau 3).
    3. Paragraf yang mengalir dengan baik.
    4. Gunakan poin-poin (bullet points) jika ada daftar.
    5. GUNAKAN TABEL jika data yang dimasukkan bersifat komparatif atau berbentuk list data yang terkait (seperti perbandingan fitur, jadwal, atau daftar harga).
    6. Perbaiki ejaan dan tanda baca (opsional tapi disarankan agar terlihat profesional).
    7. Berikan output dalam format Markdown yang bersih.
    
    Berikut adalah teks mentahnya:
    ---
    ${input}
    ---
    
    Keluarkan hasil format Markdown saja tanpa komentar tambahan.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Gagal memproses teks.";
  } catch (error) {
    console.error("AI Formatting error:", error);
    throw new Error("Terjadi kesalahan saat menghubungi AI.");
  }
}
