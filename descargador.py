import os
import yt_dlp

def descargar_canciones_artista(artista, cantidad=5):
    print(f"[*] Buscando las {cantidad} canciones principales de: {artista}...")
    
    # Carpeta donde se guardarán las canciones
    carpeta_salida = f"musica_{artista.replace(' ', '_')}"
    if not os.path.exists(carpeta_salida):
        os.makedirs(carpeta_salida)

    # Configuración de yt-dlp
    # yt-dlp permite buscar directamente anteponiendo "ytsearchN:" donde N es el número de resultados
    query = f"ytsearch{cantidad}:{artista} audio oficial"
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(carpeta_salida, '%(title)s.%(ext)s'),
        'noplaylist': True,
        'ignoreerrors': True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"[*] Iniciando descargas en la carpeta: '{carpeta_salida}'...")
            ydl.download([query])
        print("\n¡Descarga completada con éxito! 🎵")
    except Exception as e:
        print(f"[!] Ocurrió un error: {e}")

if __name__ == "__main__":
    # Pedir datos al usuario
    nombre_artista = input("Ingresa el nombre del cantante o artista: ")
    num_canciones = int(input("¿Cuántas canciones deseas descargar?: "))
    
    descargar_canciones_artista(nombre_artista, num_canciones)