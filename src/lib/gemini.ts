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

export async function generateCoverImage(params: { title: string, author: string, visualDesc: string, theme: string, logoUrl?: string }) {
  const prompt = `
    Generate a high-quality, professional ebook cover image.
    
    Book Title: ${params.title}
    Author: ${params.author}
    Visual Description requested: ${params.visualDesc}
    Theme/Vibe: ${params.theme}
    ${params.logoUrl ? `Include a logo with this reference: ${params.logoUrl}` : ''}
    
    Style guidelines:
    - High-end professional editorial aesthetic.
    - Title should be centered and very prominent.
    - Author name should be clearly visible at the bottom or top.
    - Visual elements should correspond to: ${params.visualDesc}.
    - Minimalist, clean, modern feel.
    - High-end studio lighting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        parts: [{ text: prompt }]
      }],
      config: {
        imageConfig: {
          aspectRatio: "3:4"
        }
      }
    });

    for (const part of response.candidates?.[0].content.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("Gagal menghasilkan gambar cover.");
  } catch (error) {
    console.error("AI Image error:", error);
    throw new Error("Gagal generate cover AI. Pastikan model gemini-2.5-flash-image tersedia.");
  }
}

export async function suggestCoverThemes(title: string) {
  const prompt = `Berdasarkan judul buku "${title}", berikan 3 ide tema visual untuk sampul buku.
  Berikan output dalam format JSON ARRAY string:
  ["Deskripsi Tema 1", "Deskripsi Tema 2", "Deskripsi Tema 3"]
  HANYA keluarkan JSON saja.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    const textRes = response.text || "[]";
    const cleanedJson = textRes.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedJson);
  } catch (error) {
    return ["Minimalis Modern", "Klasik Profesional", "Futuristik Teknis"];
  }
}

export async function generateOutline(topic: string) {
  const prompt = `Buatkan kerangka bab (outline) yang detail untuk sebuah buku dengan topik: "${topic}". 
  Berikan output dalam format Markdown dengan judul-judul bab yang menarik.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Gagal membuat outline.";
  } catch (error) {
    throw new Error("AI Outline error");
  }
}

export async function modifyTone(text: string, tone: string) {
  const prompt = `Ubah nada (tone) tulisan berikut menjadi "${tone}". 
  Tujuan: Tetap pertahankan esensi pesan tapi ubah gaya bahasanya.
  Teks asli:
  ---
  ${text}
  ---
  Keluarkan hasil teksnya saja.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || text;
  } catch (error) {
    throw new Error("AI Tone error");
  }
}

export interface Suggestion {
  original: string;
  replacement: string;
  reason: string;
  category: 'grammar' | 'style' | 'clarity';
}

export async function getEditingSuggestions(text: string): Promise<Suggestion[]> {
  const prompt = `Anda adalah seorang editor bahasa profesional. Analisis teks berikut dan berikan saran perbaikan untuk tata bahasa (grammar), gaya bahasa (style), atau kejelasan (clarity).
  
  Teks:
  ---
  ${text}
  ---
  
  Berikan output dalam format JSON ARRAY dengan struktur:
  [
    {
      "original": "bagian teks yang bermasalah",
      "replacement": "saran perbaikan",
      "reason": "alasan singkat perbaikan",
      "category": "grammar | style | clarity"
    }
  ]
  
  HANYA keluarkan JSON saja. Jika tidak ada perbaikan, keluarkan [].`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    
    const textRes = response.text || "[]";
    const cleanedJson = textRes.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedJson);
  } catch (error) {
    console.error("AI Suggestions error:", error);
    return [];
  }
}
