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
        this.isMouthUpsideDown = false;

        // --- Atributos para os olhos ---
        this.eyeExpressions = {}; // Para armazenar as imagens SVG dos olhos
        this.currentEyes = 'neutral'; // Expressão inicial dos olhos
        this.eyePosition = 'left'; // 'left' ou 'right'
        this.isAutoBlinking = false; // Estado do piscar automático
        this.blinkIntervalId = null; // ID do intervalo de piscar
        this.isCurrentlyBlinking = false; // Flag para evitar piscadas simultâneas
        this.eyeExpressionTimeline = {}; // Armazena { tempo: expressao }
        this.eyeGender = 'masc'; // Valor padrão: 'masc' ou 'fem'

        // Armazenar as imagens SVG das bocas
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
        this.loadSVGs(); // Carrega bocas E olhos
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
            fileInputLabel: document.querySelector('.file-input-label'),
            happyBtn: document.getElementById('happyBtn'),
            sadBtn: document.getElementById('sadBtn'),
            // --- Novos elementos para os olhos ---
            positionLeftBtn: document.getElementById('positionLeftBtn'),
            positionRightBtn: document.getElementById('positionRightBtn'),
            blinkToggleBtn: document.getElementById('blinkToggleBtn'),
            // Captura todos os seletores de expressão
            eyeExpressionSelectors: document.querySelectorAll('.eye-expression-selector'),
            // --- Novo: Botões de Gênero ---
            genderMaleBtn: document.getElementById('genderMaleBtn'),
            genderFemaleBtn: document.getElementById('genderFemaleBtn')
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
        // Event listeners para os botões de expressão
        this.elements.happyBtn.addEventListener('click', () => {
            this.toggleMouthOrientation(false);
            this.elements.happyBtn.classList.add('btn-active');
            this.elements.sadBtn.classList.remove('btn-active');
        });
        this.elements.sadBtn.addEventListener('click', () => {
            this.toggleMouthOrientation(true);
            this.elements.sadBtn.classList.add('btn-active');
            this.elements.happyBtn.classList.remove('btn-active');
        });

        // --- Listeners para os novos controles de olhos ---
        if (this.elements.positionLeftBtn && this.elements.positionRightBtn) {
            this.elements.positionLeftBtn.addEventListener('click', () => {
                this.setEyePosition('left');
                this.elements.positionLeftBtn.classList.add('btn-active');
                this.elements.positionRightBtn.classList.remove('btn-active');
            });
            this.elements.positionRightBtn.addEventListener('click', () => {
                this.setEyePosition('right');
                this.elements.positionRightBtn.classList.add('btn-active');
                this.elements.positionLeftBtn.classList.remove('btn-active');
            });
        }

        if (this.elements.blinkToggleBtn) {
            this.elements.blinkToggleBtn.addEventListener('click', () => {
                this.toggleAutoBlink();
            });
        }

        // Listener para os seletores de expressão na timeline
        if (this.elements.eyeExpressionSelectors) {
            this.elements.eyeExpressionSelectors.forEach(selector => {
                selector.addEventListener('change', this.handleEyeExpressionChange.bind(this));
            });
        }

        // --- Novo: Listeners para os botões de gênero ---
        if (this.elements.genderMaleBtn && this.elements.genderFemaleBtn) {
            this.elements.genderMaleBtn.addEventListener('click', () => {
                this.setEyeGender('masc');
                this.elements.genderMaleBtn.classList.add('btn-active');
                this.elements.genderFemaleBtn.classList.remove('btn-active');
                // Recarrega os SVGs para refletir a mudança de gênero
                this.loadSVGs();
            });
            this.elements.genderFemaleBtn.addEventListener('click', () => {
                this.setEyeGender('fem');
                this.elements.genderFemaleBtn.classList.add('btn-active');
                this.elements.genderMaleBtn.classList.remove('btn-active');
                 // Recarrega os SVGs para refletir a mudança de gênero
                this.loadSVGs();
            });
        }
    }

    setupAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    setupCanvas() {
        this.ctx = this.elements.previewCanvas.getContext('2d');
    }

    // --- Função modificada para carregar bocas e olhos com base no gênero ---
    async loadSVGs() {
        this.updateStatus('Carregando recursos...', 'info');

        // --- Bocas: Mapeamento fonema -> nome do arquivo ---
        const mouthSvgMapping = {
            'silence': 'BMP.svg', 'a': 'A.svg', 'e': 'E.svg',
            'i': 'FVI.svg', 'o': 'O.svg', 'u': 'U.svg',
            'm': 'BMP.svg', 'p': 'BMP.svg', 'b': 'BMP.svg',
            'ch': 'CDGKNSTXYZ.svg', 'sh': 'CDGKNSTXYZ.svg', 'j': 'CDGKNSTXYZ.svg',
            'r': 'R.svg', 'l': 'L.svg', 't': 'CDGKNSTXYZ.svg',
            'd': 'CDGKNSTXYZ.svg', 'c': 'CDGKNSTXYZ.svg', 'g': 'CDGKNSTXYZ.svg',
            'k': 'CDGKNSTXYZ.svg', 'n': 'CDGKNSTXYZ.svg', 's': 'CDGKNSTXYZ.svg',
            'x': 'CDGKNSTXYZ.svg', 'y': 'CDGKNSTXYZ.svg', 'z': 'CDGKNSTXYZ.svg',
            'f': 'FVI.svg', 'v': 'FVI.svg', 'q': 'Q.svg'
        };

        // --- Olhos: Mapeamento expressão -> caminho completo com base no gênero ---
        const eyeSvgMapping = {
            'neutral': `olhos/${this.eyeGender}/eyes_neutral.svg`,
            'happy': `olhos/${this.eyeGender}/eyes_happy.svg`,
            'sad': `olhos/${this.eyeGender}/eyes_sad.svg`,
            'curious': `olhos/${this.eyeGender}/eyes_curious.svg`,
            'angry': `olhos/${this.eyeGender}/eyes_angry.svg`,
            'closed': `olhos/${this.eyeGender}/eyes_closed.svg`,
            'enchanted': `olhos/${this.eyeGender}/eyes_enchanted.svg`,
            'wink': `olhos/${this.eyeGender}/eyes_wink.svg`
        };

        // Coleta todos os caminhos únicos
        // Para bocas, prefixa com 'bocas/'
        const mouthPaths = Object.values(mouthSvgMapping).map(name => `bocas/${name}`);
        // Para olhos, usa o caminho completo já definido
        const eyePaths = Object.values(eyeSvgMapping);
        
        const allUniquePaths = [...new Set([...mouthPaths, ...eyePaths])]; // Remove duplicatas se houver
        const pathToImageMap = {};

        try {
            // Carrega cada SVG único
            for (const path of allUniquePaths) {
                const response = await fetch(path);
                if (!response.ok) {
                    console.warn(`Falha ao carregar ${path}, pulando...`);
                    continue; // Continua com o próximo arquivo
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
                // Armazena a imagem usando o caminho completo como chave
                pathToImageMap[path] = img;
                URL.revokeObjectURL(url);
            }

            // Limpa os objetos de imagens antes de preencher
            this.mouthImages = {};
            this.eyeExpressions = {};

            // Preenche this.mouthImages usando o caminho completo
            for (const [phoneme, filename] of Object.entries(mouthSvgMapping)) {
                const fullPath = `bocas/${filename}`;
                if (pathToImageMap[fullPath]) {
                    this.mouthImages[phoneme] = pathToImageMap[fullPath];
                } else {
                     console.warn(`Imagem para boca '${phoneme}' (${fullPath}) não foi carregada.`);
                }
            }

            // Preenche this.eyeExpressions usando o caminho completo
            for (const [expression, fullPath] of Object.entries(eyeSvgMapping)) {
                if (pathToImageMap[fullPath]) {
                    this.eyeExpressions[expression] = pathToImageMap[fullPath];
                } else {
                     console.warn(`Imagem para olho '${expression}' (${fullPath}) não foi carregada.`);
                }
            }

            this.svgsLoaded = true;
            this.updateStatus('Pronto para começar');
            this.drawCharacterOnCanvas('silence'); // Desenha inicialmente
        } catch (error) {
            console.error('Erro ao carregar SVGs (bocas ou olhos):', error);
            this.updateStatus('Erro ao carregar recursos', 'error');
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
        // Parar o piscar automático durante a gravação, se estiver ativo
        if (this.isAutoBlinking) {
            this.stopAutoBlinking();
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

        // --- Reset do sistema de expressão dos olhos para o início ---
        this.updateEyesBasedOnTimeline(0);

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

        // Reiniciar o piscar automático se estava ativado
        if (this.isAutoBlinking) {
            this.stopAutoBlinking(); // Para garantir que não há múltiplos intervalos
            this.startAutoBlinking();
        }

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

        // Parar o piscar automático quando pausar
        if (this.isAutoBlinking) {
            this.stopAutoBlinking();
        }
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

    // Controle de duração and transições
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
            if ((dataArray[i] - mean) * (dataArray[i - 1] - mean) < 0) {
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

    // --- Nova função para lidar com mudanças nos seletores de expressão ---
    handleEyeExpressionChange(event) {
        // Extrair o tempo do ID do elemento (ex: 'exprAt2s' -> 2)
        const id = event.target.id;
        const timeMatch = id.match(/exprAt(\d+)s/);
        if (timeMatch) {
            const timeInSeconds = parseInt(timeMatch[1], 10);
            const expression = event.target.value;
            this.eyeExpressionTimeline[timeInSeconds] = expression;
            console.log(`Expressão '${expression}' definida para ${timeInSeconds}s`);
            // Atualiza a visualização se o áudio não estiver tocando
            if (!this.isPlaying) {
                this.updateEyesBasedOnTimeline(0); // Ou o tempo atual se tiver pausado
                this.drawCharacterOnCanvas(this.currentMouth); // Redesenha
            }
        }
    }

    // --- Nova função para definir a posição dos olhos ---
    setEyePosition(position) {
        if (position === 'left' || position === 'right') {
            this.eyePosition = position;
            this.drawCharacterOnCanvas(this.currentMouth); // Redesenha com nova posição
        }
    }

    // --- Nova função para definir o gênero dos olhos ---
    setEyeGender(gender) {
        if (gender === 'masc' || gender === 'fem') {
            this.eyeGender = gender;
            // A mudança de gênero agora aciona o recarregamento em setupEventListeners
            // this.loadSVGs(); // Será chamado pelo listener do botão
        }
    }

    // --- Nova função para alternar o piscar automático ---
    toggleAutoBlink() {
        this.isAutoBlinking = !this.isAutoBlinking;
        if (this.isAutoBlinking) {
            this.startAutoBlinking();
            if (this.elements.blinkToggleBtn) {
                this.elements.blinkToggleBtn.textContent = 'Desativar';
                this.elements.blinkToggleBtn.classList.add('btn-blink-active');
            }
            this.updateStatus('Piscar automático ativado');
        } else {
            this.stopAutoBlinking();
            if (this.elements.blinkToggleBtn) {
                this.elements.blinkToggleBtn.textContent = 'Ativar';
                this.elements.blinkToggleBtn.classList.remove('btn-blink-active');
            }
            this.updateStatus('Piscar automático desativado');
        }
    }

    // --- Nova função para iniciar o piscar automático ---
    startAutoBlinking() {
        // Piscar a cada 3 segundos (3000ms), com uma variação de +/- 0.5s para naturalidade
        this.blinkIntervalId = setInterval(() => {
            // Evita piscar durante uma piscada forçada ou se já estiver piscando
            if (!this.isCurrentlyBlinking && !this.isPlaying) {
                this.blinkEyes();
            }
        }, 3000 + (Math.random() * 1000 - 500)); // 2.5s a 3.5s
    }

    // --- Nova função para parar o piscar automático ---
    stopAutoBlinking() {
        if (this.blinkIntervalId) {
            clearInterval(this.blinkIntervalId);
            this.blinkIntervalId = null;
        }
        this.isCurrentlyBlinking = false; // Resetar flag
    }

    // --- Nova função para executar uma piscada ---
    blinkEyes() {
        if (this.isCurrentlyBlinking || !this.svgsLoaded) return;

        const originalExpression = this.currentEyes;
        this.isCurrentlyBlinking = true;

        // Muda para a expressão de olhos fechados
        this.currentEyes = 'closed';
        this.drawCharacterOnCanvas(this.currentMouth); // Redesenha com olhos fechados

        // Abre os olhos novamente após um curto intervalo (200ms)
        setTimeout(() => {
            this.currentEyes = originalExpression;
            this.isCurrentlyBlinking = false;
            this.drawCharacterOnCanvas(this.currentMouth); // Redesenha com expressão original
        }, 200);
    }

    // --- Nova função para atualizar os olhos com base na timeline ---
    updateEyesBasedOnTimeline(currentTime) {
        // Converter objeto timeline para array e ordenar por tempo
        const timelineEntries = Object.entries(this.eyeExpressionTimeline)
            .map(([time, expr]) => ({ time: parseFloat(time), expression: expr }))
            .sort((a, b) => a.time - b.time);

        let newExpression = 'neutral'; // Default
        // Encontrar a expressão mais recente que deve estar ativa
        for (let i = timelineEntries.length - 1; i >= 0; i--) {
            if (currentTime >= timelineEntries[i].time) {
                newExpression = timelineEntries[i].expression;
                break;
            }
        }
        this.currentEyes = newExpression;
    }

    animate() {
        if (!this.isPlaying) {
            cancelAnimationFrame(this.animationFrameId);
            return;
        }
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        const phoneme = this.getPhonemeFromData(dataArray);

        // --- Atualizar expressão dos olhos com base no tempo ---
        const currentTime = this.audioContext.currentTime - this.startTime;
        this.updateEyesBasedOnTimeline(currentTime);

        this.drawCharacterOnCanvas(phoneme); // Passa o fonema para desenhar boca

        const progress = ((this.audioContext.currentTime - this.startTime) / this.duration) * 100;
        this.elements.progressBar.style.width = `${Math.min(progress, 100)}%`;
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    // --- Modificação SUBSTANCIAL em drawCharacterOnCanvas ---
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

        // --- Calcular dimensões e posições ---
        const mouthImage = this.mouthImages[mouthShape] || this.mouthImages['silence'];
        const eyeImage = this.eyeExpressions[this.currentEyes] || this.eyeExpressions['neutral'];

        const mouthWidth = 200;
        const mouthHeight = 150;
        const eyeWidth = 150; // Ajuste conforme o tamanho dos seus SVGs de olho
        const eyeHeight = 80; // Ajuste conforme o tamanho dos seus SVGs de olho

        // Posição base centralizada verticalmente
        const centerY = canvas.height / 2;
        const mouthY = centerY + 20; // Ajuste vertical da boca
        const eyeY = centerY - 80;   // Ajuste vertical dos olhos

        let mouthX, eyeX;
        if (this.eyePosition === 'left') {
            // Personagem na esquerda, olhando para a direita
            mouthX = (canvas.width / 2) - (mouthWidth / 2) + 50; // Levemente à direita do centro
            eyeX = (canvas.width / 2) - (eyeWidth / 2) + 50;     // Levemente à direita do centro
        } else { // 'right'
            // Personagem na direita, olhando para a esquerda
            mouthX = (canvas.width / 2) - (mouthWidth / 2) - 50; // Levemente à esquerda do centro
            eyeX = (canvas.width / 2) - (eyeWidth / 2) - 50;     // Levemente à esquerda do centro
        }

        // --- Salvar estado do contexto para transformações ---
        ctx.save();

        // --- Aplicar transformação de espelhamento se necessário ---
        if (this.eyePosition === 'right') {
            // Espelhar horizontalmente em torno do centro do canvas
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            // Ajustar as coordenadas X após o espelhamento
            mouthX = canvas.width - (mouthX + mouthWidth);
            eyeX = canvas.width - (eyeX + eyeWidth);
        }

        // --- Desenhar Boca ---
        if (mouthImage) {
            // Salvar o estado atual do contexto para a boca
            ctx.save();
            if (this.isMouthUpsideDown) {
                // Aplicar transformação para inverter verticalmente a boca
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.scale(1, -1); // Inverter verticalmente
                ctx.translate(-canvas.width / 2, -canvas.height / 2);
            }
            ctx.drawImage(mouthImage, mouthX, mouthY, mouthWidth, mouthHeight);
            // Restaurar o estado do contexto para a boca
            ctx.restore();
        }

        // --- Desenhar Olhos ---
        if (eyeImage) {
            ctx.drawImage(eyeImage, eyeX, eyeY, eyeWidth, eyeHeight);
        }

        // --- Restaurar estado do contexto ---
        ctx.restore();

        this.currentMouth = mouthShape;
    }

    toggleMouthOrientation(isUpsideDown) {
        this.isMouthUpsideDown = isUpsideDown;
        this.drawCharacterOnCanvas(this.currentMouth);
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

        // --- Reset do sistema de expressão dos olhos para o início ANTES de gravar ---
        this.updateEyesBasedOnTimeline(0);

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
        this.playAudio(); // Isso agora chama updateEyesBasedOnTimeline(0) internamente
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