# Cómo correr las pruebas y subir la evidencia a GitHub

Guía paso a paso para Windows con PowerShell. Todos los comandos se escriben en la terminal, dentro de la carpeta `VidaAnimal`.

## 1. Abrir la terminal en el proyecto y activar el entorno

```powershell
cd ruta\a\VidaAnimal
.venv\Scripts\Activate.ps1
```

La línea de la terminal debe empezar con `(.venv)`.

## 2. Ponerse en la rama con el código y actualizarla

El código completo está en la rama `referencia/codigo-completo`.

```powershell
git checkout referencia/codigo-completo
git pull
```

## 3. Crear una rama para las pruebas

```powershell
git checkout -b test/evidencia-pruebas
```

## 4. Copiar los archivos nuevos

Descomprime el paquete de pruebas **dentro de la carpeta `VidaAnimal`**, respetando las carpetas. Debe quedar así:

```
VidaAnimal/
├── .github/workflows/pruebas.yml
├── scripts/correr_pruebas.py
├── tests/test_casos_de_prueba.py
└── docs/pruebas/
    ├── README.md
    ├── como-subir-a-github.md
    └── evidencia/
```

> La carpeta `.github` empieza con punto y Windows a veces la oculta. Si no la ves, en el Explorador activa **Vista → Mostrar → Elementos ocultos**.

## 5. Correr las pruebas y guardar la evidencia

```powershell
python scripts/correr_pruebas.py
```

Al final debe decir algo como `101 passed`. Se crean los archivos de evidencia en `docs\pruebas\evidencia\`. Toma una captura de pantalla de la terminal: también sirve como evidencia para el documento.

Si alguna prueba falla, el mensaje dice cuál y por qué. Corrige y vuelve a correr el comando.

## 6. Revisar qué se va a subir

```powershell
git status
```

Deben aparecer solo los archivos nuevos de las pruebas. **No** deben aparecer `.env`, `vida_animal.db` ni `.venv` (ya están en `.gitignore`). Tampoco subas la carpeta `.claude`.

## 7. Guardar los cambios en un commit

```powershell
git add .github/workflows/pruebas.yml scripts/correr_pruebas.py tests/test_casos_de_prueba.py docs/pruebas
git commit -m "test: agregar casos de prueba de la fase 3 y evidencia de ejecución"
```

## 8. Subir la rama a GitHub

```powershell
git push -u origin test/evidencia-pruebas
```

Si te pide iniciar sesión, usa la ventana del navegador que se abre.

## 9. Abrir el Pull Request y ver las pruebas en GitHub

1. Entra a <https://github.com/hsina03/vida-animal-vet>. Aparecerá un aviso amarillo con el botón **Compare & pull request**; dale clic.
2. En **base** elige `referencia/codigo-completo` y en **compare** `test/evidencia-pruebas`.
3. Escribe un título (por ejemplo, *Pruebas funcionales del sistema*) y da clic en **Create pull request**.
4. Abajo del Pull Request aparecerá la revisión **Pruebas**. Espera uno o dos minutos hasta que salga la palomita verde.
5. En la pestaña **Actions** da clic en la ejecución para ver el resumen de cada prueba y descargar la evidencia en **Artifacts → evidencia-pruebas**.

Toma capturas de la palomita verde, de la pestaña **Actions** y del resumen: son la evidencia para el documento y el tablero de Jira.

## Problemas comunes

| Mensaje | Solución |
|---|---|
| `No module named 'fastapi'` o `No module named pytest` | El entorno no está activo (paso 1) o faltan dependencias: `pip install -r requirements.txt` |
| `refusing to allow ... to create or update workflow` | Tu acceso no tiene permiso para subir archivos de `.github/workflows`. Sube los demás archivos y agrega `pruebas.yml` desde la página de GitHub con **Add file → Upload files**, dentro de la carpeta `.github/workflows` |
| `rejected ... (fetch first)` al hacer push | Alguien subió cambios antes. Ejecuta `git pull` y vuelve a hacer `git push` |
| `error: pathspec 'referencia/codigo-completo' did not match` | Ejecuta `git fetch` y repite el paso 2 |
