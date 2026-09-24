# 🎵 YT Music Studio (Node.js)

Un panel web moderno e interactivo construido con **Node.js, Express, Socket.IO y yt-dlp** para buscar, previsualizar y descargar música de YouTube en formato MP3 con calidad configurable (128k, 192k, 320k) y barra de progreso en tiempo real.



## 🚀 Características

- **🔍 Búsqueda de canciones:** Muestra títulos, duraciones, canales y carátulas antes de realizar la descarga.
- **☑️ Selección flexible:** Selecciona/desmarca temas individualmente o en lote.
- **🎧 Calidad de Audio MP3 configurable:** Elige entre 128 kbps, 192 kbps (recomendada) y 320 kbps (alta fidelidad).
- **⚡ Cola de Descargas en Tiempo Real:** Visualiza la velocidad (`MiB/s`), porcentaje de progreso (`0-100%`) y estado animado durante la conversión con WebSockets (`Socket.IO`).
- **📁 Organización automática:** Crea automáticamente carpetas por artista (`musica_<Artista>`).
- **🎨 Diseño Dark Glassmorphism:** Interfaz visual atractiva con acentos neón y notificaciones toast.

## 📋 Requisitos Previos

Antes de ejecutar el proyecto, asegúrate de tener instalado en tu sistema:
1. [Node.js](https://nodejs.org/) (v18 o superior)
2. [yt-dlp](https://github.com/yt-dlp/yt-dlp)
3. [FFmpeg](https://ffmpeg.org/) (agregado a las variables de entorno PATH)

## 🛠️ Instalación y Uso

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/TU_USUARIO/YT_Music.git
   cd YT_Music
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Iniciar la aplicación:**
   ```bash
   npm start
   ```

4. **Abrir en el navegador:**
   Navega a [http://localhost:3000](http://localhost:3000)

## 📄 Licencia

MIT
