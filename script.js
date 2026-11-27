
// ==========================================
// Y3MATE - SCRIPT.JS
// ==========================================


// 1. YOUTUBE VIDEO PREVIEW

const youtubeForm = document.getElementById("youtubeForm");
const youtubeUrl = document.getElementById("youtubeUrl");
const videoFrame = document.getElementById("videoFrame");

youtubeForm.addEventListener("submit", function(event) {
    event.preventDefault();

    const url = youtubeUrl.value.trim();
    const videoId = getYouTubeID(url);

    if (!videoId) {
        videoFrame.innerHTML = "<p>Invalid YouTube URL.</p>";
        return;
    }

    videoFrame.innerHTML = `
        <iframe
            width="100%"
            height="220"
            src="https://www.youtube.com/embed/${videoId}"
            title="YouTube video preview"
            frameborder="0"
            allowfullscreen>
        </iframe>
    `;
});

/**
 * @param {string} url
 * @returns {string | null}
 */
function getYouTubeID(url) {
    try {
        const parsedUrl = new URL(url);

        if (parsedUrl.hostname === "youtu.be") {
            return parsedUrl.pathname.slice(1) || null;
        }

        if (
            ["www.youtube.com", "youtube.com", "m.youtube.com"]
            .includes(parsedUrl.hostname)
        ) {
            if (parsedUrl.pathname === "/watch") {
                return parsedUrl.searchParams.get("v");
            }

            const match = parsedUrl.pathname.match(
                /^\/(?:embed|shorts)\/([^/?]+)/
            );

            return match ? match[1] : null;
        }

        return null;

    } catch {
        return null;
    }
}


// 2. AUDIO FILE SELECTION

const audioFile = document.getElementById("audioFile");
const fileName = document.getElementById("fileName");
const convertButton = document.getElementById("convertButton");
const statusText = document.getElementById("status");
const outputFormat = document.getElementById("outputFormat");

audioFile.addEventListener("change", function() {
    const file = audioFile.files[0];

    if (!file) {
        fileName.textContent = "No file selected";
        convertButton.disabled = true;
        return;
    }

    fileName.textContent = file.name;
    convertButton.disabled = false;
    statusText.textContent = "";
});


// 3. AUDIO CONVERTER

convertButton.addEventListener("click", async function() {
    const file = audioFile.files[0];

    if (!file) return;

    let audioContext = null;
    let downloadUrl = null;

    try {
        convertButton.disabled = true;
        statusText.textContent = "Converting audio...";

        audioContext = new (
            window.AudioContext || window.webkitAudioContext
        )();

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const format = outputFormat.value;
        let blob;

        if (format === "mp3") {
            if (!window.lamejs) {
                throw new Error("MP3 library not loaded.");
            }

            const channels = Math.min(
                audioBuffer.numberOfChannels, 2
            );

            const encoder = new lamejs.Mp3Encoder(
                channels,
                audioBuffer.sampleRate,
                128
            );

            const left = audioBuffer.getChannelData(0);
            const right = channels === 2
                ? audioBuffer.getChannelData(1)
                : null;

            const leftInt = new Int16Array(left.length);
            const rightInt = right
                ? new Int16Array(right.length)
                : null;

            for (let i = 0; i < left.length; i++) {
                leftInt[i] = Math.max(
                    -32768,
                    Math.min(32767, left[i] * 32768)
                );

                if (rightInt) {
                    rightInt[i] = Math.max(
                        -32768,
                        Math.min(32767, right[i] * 32768)
                    );
                }
            }

            const mp3Parts = [];
            const blockSize = 1152;

            for (let i = 0; i < leftInt.length; i += blockSize) {
                const leftChunk = leftInt.subarray(
                    i, i + blockSize
                );

                const mp3Chunk = rightInt
                    ? encoder.encodeBuffer(
                        leftChunk,
                        rightInt.subarray(i, i + blockSize)
                    )
                    : encoder.encodeBuffer(leftChunk);

                if (mp3Chunk.length > 0) {
                    mp3Parts.push(new Uint8Array(mp3Chunk));
                }
            }

            const finalChunk = encoder.flush();

            if (finalChunk.length > 0) {
                mp3Parts.push(new Uint8Array(finalChunk));
            }

            blob = new Blob(mp3Parts, {
                type: "audio/mpeg"
            });

        } else if (format === "wav") {
            blob = audioBufferToWav(audioBuffer);

        } else {
            throw new Error("Unsupported format.");
        }

        downloadUrl = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = downloadUrl;

        const dotIndex = file.name.lastIndexOf(".");
        const baseName = dotIndex > 0
            ? file.name.slice(0, dotIndex)
            : file.name;

        link.download = baseName + "." + format;

        document.body.appendChild(link);
        link.click();
        link.remove();

        statusText.textContent = "Conversion successful!";

    } catch (error) {
        console.error(error);

        statusText.textContent =
            "Conversion failed: " + error.message;

    } finally {
        if (downloadUrl) {
            setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 1000);
        }

        if (audioContext && audioContext.state !== "closed") {
            await audioContext.close();
        }

        convertButton.disabled = false;
    }
});


// 4. WAV ENCODER

/**
 * @param {AudioBuffer} buffer
 * @returns {Blob}
 */
function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;

    const bytesPerSample = 2;
    const dataSize = frames * channels * bytesPerSample;

    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);

    /**
     * @param {number} offset
     * @param {string} string
     */
    function writeString(offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(
                offset + i,
                string.charCodeAt(i)
            );
        }
    }

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");

    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);

    view.setUint32(
        28,
        sampleRate * channels * bytesPerSample,
        true
    );

    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, 16, true);

    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;

    for (let i = 0; i < frames; i++) {
        for (let channel = 0; channel < channels; channel++) {
            let sample = buffer.getChannelData(channel)[i];

            sample = Math.max(-1, Math.min(1, sample));

            const value = sample < 0
                ? sample * 32768
                : sample * 32767;

            view.setInt16(offset, value, true);
            offset += 2;
        }
    }

    return new Blob([wavBuffer], {
        type: "audio/wav"
    });
}
