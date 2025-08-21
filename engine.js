class LipSyncApp {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.source = null;
        this.analyser = null;
        this.isPlaying = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.animationFrameId = null;
        this.startTime = 0;
        this.pauseTime = 0;
        this.duration = 0;
        this.backgroundType = 'green';
        this.isRecordingVideo = false;
        this.videoFrames = [];
        this.mediaRecorderVideo = null;
        this.recordingStream = null;
        this.currentMouth = 'silence';
        
        // Novo: Armazenar as imagens SVG das bocas
        this.mouthImages = {};
        this.svgsLoaded = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupAudioContext();
        this.setupCanvas();
        this.loadMouthSVGs(); // Carregar SVGs na inicialização
    }

    initializeElements() {
        this.elements = {
            audioFile: document.getElementById('audioFile'),
            recordBtn: document.getElementById('recordBtn'),
            stopBtn: document.getElementById('stopBtn'),
            playBtn: document.getElementById('playBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            audioInfo: document.getElementById('audioInfo'),
            progressBar: document.getElementById('progressBar'),
            previewCanvas: document.getElementById('previewCanvas'),
            backgroundOptions: document.querySelectorAll('.bg-option'),
            generateBtn: document.getElementById('generateBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            status: document.getElementById('status'),
            fileInputLabel: document.querySelector('.file-input-label')
        };
    }

    setupEventListeners() {
        this.elements.audioFile.addEventListener('change', this.handleFileSelect.bind(this));
        this.elements.recordBtn.addEventListener('click', this.startRecording.bind(this));
        this.elements.stopBtn.addEventListener('click', this.stopRecording.bind(this));
        this.elements.playBtn.addEventListener('click', this.playAudio.bind(this));
        this.elements.pauseBtn.addEventListener('click', this.pauseAudio.bind(this));
        this.elements.generateBtn.addEventListener('click', this.generateVideo.bind(this));
        this.elements.downloadBtn.addEventListener('click', this.downloadVideo.bind(this));
        this.elements.backgroundOptions.forEach(option => {
            option.addEventListener('click', this.handleBackgroundChange.bind(this));
        });
    }

    setupAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    setupCanvas() {
        this.ctx = this.elements.previewCanvas.getContext('2d');
    }

    // Novo método: Carregar os SVGs das bocas
    async loadMouthSVGs() {
        this.updateStatus('Carregando recursos...', 'info');
        
        // Mapeamento baseado na sua tabela
        const svgMapping = {
            'silence': 'BMP.svg',
            'a': 'A.svg',
            'e': 'E.svg',
            'i': 'FVI.svg',
            'o': 'O.svg',
            'u': 'U.svg',
            'm': 'BMP.svg',
            'p': 'BMP.svg',
            'b': 'BMP.svg',
            'ch': 'CDGKNSTXYZ.svg',
            'sh': 'CDGKNSTXYZ.svg',
            'j': 'CDGKNSTXYZ.svg',
            'r': 'R.svg',
            'l': 'L.svg',
            't': 'CDGKNSTXYZ.svg',
            'd': 'CDGKNSTXYZ.svg',
            'c': 'CDGKNSTXYZ.svg',
            'g': 'CDGKNSTXYZ.svg',
            'k': 'CDGKNSTXYZ.svg',
            'n': 'CDGKNSTXYZ.svg',
            's': 'CDGKNSTXYZ.svg',
            'x': 'CDGKNSTXYZ.svg',
            'y': 'CDGKNSTXYZ.svg',
            'z': 'CDGKNSTXYZ.svg',
            'f': 'FVI.svg',
            'v': 'FVI.svg',
            'q': 'Q.svg'
        };

        // Carregar apenas os arquivos únicos
        const uniqueFiles = [...new Set(Object.values(svgMapping))];
        const fileToImageMap = {};

        try {
            for (const filename of uniqueFiles) {
                const response = await fetch(`bocas/${filename}`);
                if (!response.ok) {
                    throw new Error(`Falha ao carregar ${filename}`);
                }
                
                const svgText = await response.text();
                const img = new Image();
                const blob = new Blob([svgText], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = url;
                });
                
                fileToImageMap[filename] = img;
                URL.revokeObjectURL(url);
            }

            // Mapear fonemas para imagens carregadas
            for (const [phoneme, filename] of Object.entries(svgMapping)) {
                this.mouthImages[phoneme] = fileToImageMap[filename];
            }

            this.svgsLoaded = true;
            this.updateStatus('Pronto para começar');
            this.drawCharacterOnCanvas('silence'); // Desenhar estado inicial
            
        } catch (error) {
            console.error('Erro ao carregar SVGs:', error);
            this.updateStatus('Erro ao carregar recursos das bocas', 'error');
            this.svgsLoaded = false;
        }
    }

    updateStatus(message, type = 'info') {
        this.elements.status.textContent = message;
        this.elements.status.className = `status status-${type}`;
    }

    updateButtonStates(state) {
        this.elements.playBtn.disabled = !state.play;
        this.elements.pauseBtn.disabled = !state.pause;
        this.elements.recordBtn.disabled = !state.record;
        this.elements.stopBtn.disabled = !state.stop;
        this.elements.generateBtn.disabled = !state.generate;
        this.elements.downloadBtn.disabled = !state.download;
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.updateStatus('Carregando áudio...');
            this.elements.fileInputLabel.textContent = file.name;
            const reader = new FileReader();
            reader.onload = e => {
                this.audioContext.decodeAudioData(e.target.result, buffer => {
                    this.audioBuffer = buffer;
                    this.duration = buffer.duration;
                    this.updateStatus('Áudio carregado com sucesso!');
                    this.elements.audioInfo.style.display = 'block';
                    this.elements.audioInfo.textContent = `Arquivo: ${file.name} | Duração: ${this.duration.toFixed(2)}s`;
                    this.updateButtonStates({ 
                        play: this.svgsLoaded, 
                        pause: false, 
                        record: true, 
                        stop: false, 
                        generate: this.svgsLoaded, 
                        download: false 
                    });
                }, error => {
                    this.updateStatus('Erro ao decodificar áudio.', 'error');
                    console.error('Error decoding audio:', error);
                });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    startRecording() {
        if (!this.audioContext) this.setupAudioContext();
        this.updateStatus('Gravando áudio...');
        this.updateButtonStates({ play: false, pause: false, record: false, stop: true, generate: false, download: false });

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.recordingStream = stream;
                this.mediaRecorder = new MediaRecorder(stream);
                this.recordedChunks = [];

                this.mediaRecorder.ondataavailable = event => {
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = async () => {
                    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                    const arrayBuffer = await blob.arrayBuffer();

                    try {
                        const buffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        this.audioBuffer = buffer;
                        this.duration = buffer.duration;
                        this.updateStatus('Gravação concluída!');
                        this.elements.audioInfo.style.display = 'block';
                        this.elements.audioInfo.textContent = `Gravação concluída | Duração: ${this.duration.toFixed(2)}s`;
                        this.updateButtonStates({ 
                            play: this.svgsLoaded, 
                            pause: false, 
                            record: true, 
                            stop: false, 
                            generate: this.svgsLoaded, 
                            download: false 
                        });
                    } catch (err) {
                        this.updateStatus('Erro ao decodificar a gravação.', 'error');
                        console.error('Error decoding recorded audio:', err);
                    }
                };

                this.mediaRecorder.start();
            })
            .catch(error => {
                this.updateStatus('Permissão para microfone negada.', 'error');
                console.error('Error accessing microphone:', error);
            });
    }

    stopRecording() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.recordingStream.getTracks().forEach(track => track.stop());
        }
    }

    playAudio() {
        if (!this.audioBuffer || !this.svgsLoaded) return;
        this.updateStatus('Reproduzindo...');
        this.updateButtonStates({ play: false, pause: true, record: false, stop: false, generate: false, download: false });

        if (this.source) {
            this.source.stop();
        }

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.source.onended = () => {
            if (!this.isRecordingVideo) {
                this.updateStatus('Pronto para começar');
                this.updateButtonStates({ play: true, pause: false, record: true, stop: false, generate: true, download: true });
                this.drawCharacterOnCanvas('silence'); // Voltar ao estado de silêncio
            }
        };

        this.startTime = this.audioContext.currentTime - this.pauseTime;
        this.source.start(0, this.pauseTime);
        this.isPlaying = true;
        this.animate();
    }

    pauseAudio() {
        if (!this.isPlaying) return;
        this.source.stop();
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.isPlaying = false;
        cancelAnimationFrame(this.animationFrameId);
        this.updateStatus('Pausado');
        this.updateButtonStates({ play: true, pause: false, record: false, stop: false, generate: true, download: false });
        this.drawCharacterOnCanvas('silence'); // Mostrar silêncio quando pausado
    }

    /** --- Centralização da lógica de fonemas --- **/
    getPhonemeFromData(dataArray) {
        let average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const lowFreq = (dataArray[0] + dataArray[1] + dataArray[2] + dataArray[3]) / 4;
        const midLowFreq = (dataArray[4] + dataArray[5] + dataArray[6] + dataArray[7]) / 4;
        const midFreq = (dataArray[8] + dataArray[9] + dataArray[10] + dataArray[11]) / 4;
        const highFreq = (dataArray[12] + dataArray[13] + dataArray[14] + dataArray[15]) / 4;

        if (average < 25) return 'silence';
        if (highFreq > 50 && midFreq > 50) return 'ch';
        if (midLowFreq > 45 && midFreq > 40) return 'r';
        if (midFreq > 35 && average > 35) return 't';
        if (lowFreq > midFreq && lowFreq > 40) return 'm';
        if (lowFreq > 50 && midLowFreq > 40) return Math.random() > 0.6 ? 'a' : 'o';
        if (highFreq > 35 && midFreq > 30) return Math.random() > 0.5 ? 'e' : 'i';
        if (lowFreq > 35 && highFreq < 25) return 'u';

        const vowels = ['a', 'e', 'i', 'o', 'u'];
        return vowels[Math.floor(Math.random() * vowels.length)];
    }

    animate() {
        if (!this.isPlaying) {
            cancelAnimationFrame(this.animationFrameId);
            return;
        }

        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        const phoneme = this.getPhonemeFromData(dataArray);
        this.drawCharacterOnCanvas(phoneme);

        const progress = ((this.audioContext.currentTime - this.startTime) / this.duration) * 100;
        this.elements.progressBar.style.width = `${Math.min(progress, 100)}%`;

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    // Método completamente reescrito - apenas desenha a boca SVG
    drawCharacterOnCanvas(mouthShape) {
        if (!this.svgsLoaded) {
            return; // Não desenha nada se os SVGs não estão carregados
        }

        const canvas = this.elements.previewCanvas;
        const ctx = this.ctx;
        
        // Limpar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Desenhar background se necessário
        if (this.backgroundType === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Desenhar apenas a boca SVG
        const mouthImage = this.mouthImages[mouthShape] || this.mouthImages['silence'];
        if (mouthImage) {
            // Centralizar a boca no canvas
            const mouthWidth = 200; // Ajuste conforme necessário
            const mouthHeight = 150; // Ajuste conforme necessário
            const x = (canvas.width - mouthWidth) / 2;
            const y = (canvas.height - mouthHeight) / 2;
            
            ctx.drawImage(mouthImage, x, y, mouthWidth, mouthHeight);
        }

        // Armazenar a boca atual para referência
        this.currentMouth = mouthShape;
    }

    handleBackgroundChange(event) {
        this.elements.backgroundOptions.forEach(option => option.classList.remove('active'));
        const selectedOption = event.currentTarget;
        selectedOption.classList.add('active');
        this.backgroundType = selectedOption.dataset.bg;
        
        // Redesenhar com o novo background
        this.drawCharacterOnCanvas(this.currentMouth);
    }

    async generateVideo() {
        if (!this.svgsLoaded) {
            this.updateStatus('Aguarde o carregamento dos recursos', 'error');
            return;
        }

        this.updateStatus('Gerando vídeo...', 'info');
        this.updateButtonStates({ play: false, pause: false, record: false, stop: false, generate: false, download: false });
        this.isRecordingVideo = true;
        this.pauseTime = 0;

        const stream = this.elements.previewCanvas.captureStream(30);
        this.mediaRecorderVideo = new MediaRecorder(stream, { mimeType: 'video/webm' });
        this.videoFrames = [];

        this.mediaRecorderVideo.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.videoFrames.push(event.data);
            }
        };

        this.mediaRecorderVideo.onstop = () => {
            this.isRecordingVideo = false;
            this.elements.downloadBtn.style.display = 'inline-flex';
            this.updateButtonStates({ play: true, pause: false, record: true, stop: false, generate: true, download: true });
            this.updateStatus('Vídeo gerado com sucesso!', 'success');
        };

        this.mediaRecorderVideo.start();
        this.playAudio();
    }

    downloadVideo() {
        const videoBlob = new Blob(this.videoFrames, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = videoUrl;
        a.download = 'lipsync_meme.webm';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(videoUrl);
        document.body.removeChild(a);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LipSyncApp();
});