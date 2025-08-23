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
        
        // Sistema de controle de fonemas melhorado
        this.phonemeHistory = [];
        this.lastPhoneme = 'silence';
        this.phonemeDuration = 0;
        this.minPhonemeDuration = 0.08; // Mínimo 80ms por fonema
        this.lastTransitionTime = 0;
        this.transitionCooldown = 0.05; // 50ms entre mudanças
        this.silenceThreshold = 15;
        this.voiceThreshold = 25;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupAudioContext();
        this.setupCanvas();
        this.loadMouthSVGs();
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

    async loadMouthSVGs() {
        this.updateStatus('Carregando recursos...', 'info');
        
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

            for (const [phoneme, filename] of Object.entries(svgMapping)) {
                this.mouthImages[phoneme] = fileToImageMap[filename];
            }

            this.svgsLoaded = true;
            this.updateStatus('Pronto para começar');
            this.drawCharacterOnCanvas('silence');
            
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
                    // Calibração automática baseada no áudio carregado
                    this.calibrateAudioThresholds();
                }, error => {
                    this.updateStatus('Erro ao decodificar áudio.', 'error');
                    console.error('Error decoding audio:', error);
                });
            };
            reader.readAsArrayBuffer(file);
        }
    }

    // Calibração automática dos thresholds
    calibrateAudioThresholds() {
        if (!this.audioBuffer) return;
        
        const samples = this.audioBuffer.getChannelData(0);
        const windowSize = 1024;
        const energyLevels = [];
        
        // Amostragem para análise rápida
        const step = Math.max(1, Math.floor(samples.length / (windowSize * 100)));
        
        for (let i = 0; i < samples.length - windowSize; i += windowSize * step) {
            const window = samples.slice(i, i + windowSize);
            const energy = window.reduce((sum, sample) => sum + Math.abs(sample) * 255, 0) / windowSize;
            energyLevels.push(energy);
        }
        
        if (energyLevels.length > 0) {
            energyLevels.sort((a, b) => a - b);
            const percentile20 = energyLevels[Math.floor(energyLevels.length * 0.2)] || 10;
            const percentile60 = energyLevels[Math.floor(energyLevels.length * 0.6)] || 25;
            
            this.silenceThreshold = Math.max(8, percentile20 * 0.8);
            this.voiceThreshold = Math.max(15, percentile60 * 0.9);
            
            console.log(`Thresholds calibrados - Silêncio: ${this.silenceThreshold.toFixed(1)}, Voz: ${this.voiceThreshold.toFixed(1)}`);
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
                        this.calibrateAudioThresholds();
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

        // Reset do sistema de fonemas
        this.phonemeHistory = [];
        this.lastPhoneme = 'silence';
        this.phonemeDuration = 0;
        this.lastTransitionTime = 0;

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512; // Aumentado para melhor resolução
        this.analyser.smoothingTimeConstant = 0.3; // Menos suavização para mais responsividade
        this.source.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.source.onended = () => {
            if (!this.isRecordingVideo) {
                this.updateStatus('Pronto para começar');
                this.updateButtonStates({ play: true, pause: false, record: true, stop: false, generate: true, download: true });
                this.drawCharacterOnCanvas('silence');
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
        this.drawCharacterOnCanvas('silence');
    }

    // Análise melhorada de fonemas
    getPhonemeFromData(dataArray) {
        const currentTime = this.audioContext.currentTime - this.startTime;
        
        // Calcular energia total
        const totalEnergy = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        // Detectar silêncio
        if (totalEnergy < this.silenceThreshold) {
            return this.updatePhonemeWithTiming('silence', currentTime);
        }

        // Dividir espectro em bandas mais específicas
        const veryLowFreq = this.getFreqAverage(dataArray, 0, 4);      
        const lowFreq = this.getFreqAverage(dataArray, 5, 12);         
        const lowMidFreq = this.getFreqAverage(dataArray, 13, 25);     
        const midFreq = this.getFreqAverage(dataArray, 26, 50);        
        const midHighFreq = this.getFreqAverage(dataArray, 51, 80);    
        const highFreq = this.getFreqAverage(dataArray, 81, 110);      
        const veryHighFreq = this.getFreqAverage(dataArray, 111, 127); 

        // Calcular características espectrais
        const spectralCentroid = this.calculateSpectralCentroid(dataArray);
        const spectralRolloff = this.calculateSpectralRolloff(dataArray, 0.85);
        const zeroCrossingRate = this.calculateZeroCrossingRate(dataArray);
        
        // Sistema de pontuação
        const scores = {
            'a': this.scorePhoneme_A(veryLowFreq, lowFreq, lowMidFreq, midFreq, totalEnergy, spectralCentroid),
            'e': this.scorePhoneme_E(lowMidFreq, midFreq, midHighFreq, spectralCentroid),
            'i': this.scorePhoneme_I(midHighFreq, highFreq, veryHighFreq, spectralCentroid),
            'o': this.scorePhoneme_O(veryLowFreq, lowFreq, midFreq, spectralRolloff),
            'u': this.scorePhoneme_U(veryLowFreq, lowFreq, spectralRolloff),
            'm': this.scorePhoneme_M(veryLowFreq, lowFreq, zeroCrossingRate),
            'r': this.scorePhoneme_R(lowMidFreq, midFreq, zeroCrossingRate),
            'l': this.scorePhoneme_L(midFreq, midHighFreq, spectralCentroid),
            'ch': this.scorePhoneme_CH(highFreq, veryHighFreq, zeroCrossingRate),
            'q': this.scorePhoneme_Q(lowMidFreq, midFreq, highFreq)
        };

        // Encontrar fonema com maior pontuação
        let maxScore = 0;
        let detectedPhoneme = 'silence';
        
        for (const [phoneme, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                detectedPhoneme = phoneme;
            }
        }

        // Aplicar limiar mínimo e lógica de fallback
        if (maxScore < 2) {
            detectedPhoneme = this.fallbackPhonemeDetection(
                veryLowFreq, lowFreq, midFreq, highFreq, totalEnergy
            );
        }

        return this.updatePhonemeWithTiming(detectedPhoneme, currentTime);
    }

    // Controle de duração e transições
    updatePhonemeWithTiming(newPhoneme, currentTime) {
        // Se é o mesmo fonema, incrementar duração
        if (newPhoneme === this.lastPhoneme) {
            this.phonemeDuration += 0.016; // Aproximadamente 60fps
            return this.lastPhoneme;
        }
        
        // Verificar cooldown de transição
        if (currentTime - this.lastTransitionTime < this.transitionCooldown) {
            this.phonemeDuration += 0.016;
            return this.lastPhoneme;
        }
        
        // Verificar duração mínima (exceto para silêncio entrando ou saindo)
        const isTransitionToSilence = newPhoneme === 'silence';
        const isTransitionFromSilence = this.lastPhoneme === 'silence';
        
        if (!isTransitionToSilence && !isTransitionFromSilence && 
            this.phonemeDuration < this.minPhonemeDuration) {
            this.phonemeDuration += 0.016;
            return this.lastPhoneme;
        }
        
        // Aplicar transição suave para alguns casos
        const smoothedPhoneme = this.applySmoothTransition(this.lastPhoneme, newPhoneme, this.phonemeDuration);
        
        // Registrar no histórico
        this.phonemeHistory.push({
            phoneme: this.lastPhoneme,
            duration: this.phonemeDuration,
            timestamp: currentTime - this.phonemeDuration
        });
        
        // Limitar histórico
        if (this.phonemeHistory.length > 30) {
            this.phonemeHistory.shift();
        }
        
        // Atualizar estado
        this.lastPhoneme = smoothedPhoneme;
        this.phonemeDuration = 0;
        this.lastTransitionTime = currentTime;
        
        return smoothedPhoneme;
    }

    // Aplicar transições suaves entre fonemas
    applySmoothTransition(fromPhoneme, toPhoneme, duration) {
        // Para durações muito curtas, aplicar transições intermediárias
        if (duration < 0.06) {
            const transitionMap = {
                'silence_a': 'm',
                'silence_e': 'ch', 
                'silence_i': 'i',
                'silence_o': 'm',
                'silence_u': 'm',
                'a_i': 'e',
                'i_a': 'e',
                'o_u': 'o',
                'u_o': 'u',
                'a_e': duration < 0.03 ? 'a' : 'e',
                'e_a': duration < 0.03 ? 'e' : 'a'
            };
            
            const key = `${fromPhoneme}_${toPhoneme}`;
            return transitionMap[key] || toPhoneme;
        }
        
        return toPhoneme;
    }

    // Funções de pontuação para cada fonema
    scorePhoneme_A(veryLowFreq, lowFreq, lowMidFreq, midFreq, totalEnergy, spectralCentroid) {
        let score = 0;
        if (lowFreq > 35 && midFreq > 30) score += 3;
        if (spectralCentroid > 0.3 && spectralCentroid < 0.6) score += 2;
        if (totalEnergy > this.voiceThreshold) score += 1;
        if (lowFreq / (midFreq + 1) > 0.8) score += 1;
        return score;
    }

    scorePhoneme_E(lowMidFreq, midFreq, midHighFreq, spectralCentroid) {
        let score = 0;
        if (midFreq > 35 && midHighFreq > 25) score += 3;
        if (spectralCentroid > 0.4 && spectralCentroid < 0.7) score += 2;
        if (midFreq > lowMidFreq * 1.2) score += 1;
        return score;
    }

    scorePhoneme_I(midHighFreq, highFreq, veryHighFreq, spectralCentroid) {
        let score = 0;
        if (highFreq > 40) score += 3;
        if (veryHighFreq > 30) score += 2;
        if (spectralCentroid > 0.6) score += 2;
        if (highFreq > midHighFreq * 1.3) score += 1;
        return score;
    }

    scorePhoneme_O(veryLowFreq, lowFreq, midFreq, spectralRolloff) {
        let score = 0;
        if (lowFreq > 45 && veryLowFreq > 25) score += 3;
        if (spectralRolloff < 0.4) score += 2;
        if (lowFreq > midFreq * 1.5) score += 2;
        return score;
    }

    scorePhoneme_U(veryLowFreq, lowFreq, spectralRolloff) {
        let score = 0;
        if (veryLowFreq > 40 && lowFreq > 35) score += 3;
        if (spectralRolloff < 0.3) score += 3;
        if (veryLowFreq > lowFreq * 0.9) score += 1;
        return score;
    }

    scorePhoneme_M(veryLowFreq, lowFreq, zeroCrossingRate) {
        let score = 0;
        if (veryLowFreq > 30 && lowFreq > 25) score += 2;
        if (zeroCrossingRate < 0.3) score += 2;
        return score;
    }

    scorePhoneme_R(lowMidFreq, midFreq, zeroCrossingRate) {
        let score = 0;
        if (lowMidFreq > 30 && midFreq > 25) score += 2;
        if (zeroCrossingRate > 0.4) score += 3;
        return score;
    }

    scorePhoneme_L(midFreq, midHighFreq, spectralCentroid) {
        let score = 0;
        if (midFreq > 30 && midHighFreq > 20) score += 2;
        if (spectralCentroid > 0.35 && spectralCentroid < 0.65) score += 2;
        return score;
    }

    scorePhoneme_CH(highFreq, veryHighFreq, zeroCrossingRate) {
        let score = 0;
        if (highFreq > 45 && veryHighFreq > 30) score += 3;
        if (zeroCrossingRate > 0.6) score += 2;
        return score;
    }

    scorePhoneme_Q(lowMidFreq, midFreq, highFreq) {
        let score = 0;
        if (midFreq > 35 && lowMidFreq > 25 && highFreq < 35) score += 2;
        return score;
    }

    // Métodos auxiliares para análise espectral
    calculateSpectralCentroid(dataArray) {
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            numerator += i * dataArray[i];
            denominator += dataArray[i];
        }
        
        return denominator > 0 ? numerator / (denominator * dataArray.length) : 0;
    }

    calculateSpectralRolloff(dataArray, threshold = 0.85) {
        const totalEnergy = dataArray.reduce((a, b) => a + b, 0);
        const targetEnergy = totalEnergy * threshold;
        
        let cumulativeEnergy = 0;
        for (let i = 0; i < dataArray.length; i++) {
            cumulativeEnergy += dataArray[i];
            if (cumulativeEnergy >= targetEnergy) {
                return i / dataArray.length;
            }
        }
        
        return 1.0;
    }

    calculateZeroCrossingRate(dataArray) {
        let crossings = 0;
        const mean = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        for (let i = 1; i < dataArray.length; i++) {
            if ((dataArray[i] - mean) * (dataArray[i-1] - mean) < 0) {
                crossings++;
            }
        }
        
        return crossings / dataArray.length;
    }

    fallbackPhonemeDetection(veryLowFreq, lowFreq, midFreq, highFreq, totalEnergy) {
        const total = veryLowFreq + lowFreq + midFreq + highFreq;
        if (total === 0) return 'silence';
        
        const ratios = {
            veryLow: veryLowFreq / total,
            low: lowFreq / total,
            mid: midFreq / total,
            high: highFreq / total
        };
        
        if (ratios.veryLow > 0.4) return Math.random() > 0.5 ? 'u' : 'o';
        if (ratios.high > 0.4) return Math.random() > 0.5 ? 'i' : 'ch';
        if (ratios.mid > 0.4) return Math.random() > 0.5 ? 'e' : 'a';
        if (ratios.low > 0.4) return Math.random() > 0.5 ? 'a' : 'm';
        
        // Variação mais inteligente baseada no histórico
        return this.getVariedPhoneme();
    }

    getVariedPhoneme() {
        const recentPhonemes = this.phonemeHistory.slice(-5).map(h => h.phoneme);
        const vowels = ['a', 'e', 'i', 'o', 'u'];
        const consonants = ['m', 'l', 'r', 'ch'];
        
        // Evitar repetição excessiva
        const lastPhoneme = recentPhonemes[recentPhonemes.length - 1] || 'silence';
        
        if (vowels.includes(lastPhoneme)) {
            // Se a última foi vogal, alternar para consoante às vezes
            return Math.random() > 0.7 ? 
                   consonants[Math.floor(Math.random() * consonants.length)] :
                   vowels[Math.floor(Math.random() * vowels.length)];
        } else {
            // Se a última foi consoante, preferir vogal
            return Math.random() > 0.3 ?
                   vowels[Math.floor(Math.random() * vowels.length)] :
                   consonants[Math.floor(Math.random() * consonants.length)];
        }
    }

    getFreqAverage(dataArray, start, end) {
        const validEnd = Math.min(end, dataArray.length - 1);
        const validStart = Math.max(0, start);
        let sum = 0;
        let count = 0;
        
        for (let i = validStart; i <= validEnd; i++) {
            sum += dataArray[i];
            count++;
        }
        
        return count > 0 ? sum / count : 0;
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

    drawCharacterOnCanvas(mouthShape) {
        if (!this.svgsLoaded) return;

        const canvas = this.elements.previewCanvas;
        const ctx = this.ctx;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Desenhar background se necessário
        if (this.backgroundType === 'green') {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Desenhar apenas a boca SVG
        const mouthImage = this.mouthImages[mouthShape] || this.mouthImages['silence'];
        if (mouthImage) {
            const mouthWidth = 200;
            const mouthHeight = 150;
            const x = (canvas.width - mouthWidth) / 2;
            const y = (canvas.height - mouthHeight) / 2;
            
            ctx.drawImage(mouthImage, x, y, mouthWidth, mouthHeight);
        }

        this.currentMouth = mouthShape;
    }

    handleBackgroundChange(event) {
        this.elements.backgroundOptions.forEach(option => option.classList.remove('active'));
        const selectedOption = event.currentTarget;
        selectedOption.classList.add('active');
        this.backgroundType = selectedOption.dataset.bg;
        
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