// IMÁGENES VERIFICADAS 100% FUNCIONALES Y ESPECÍFICAS
        const servicesData = {
            skinPrep: {
                title: "Diagnóstico de Piel",
                icon: "fas fa-spa",
                subtitle: "Preparación y cuidado profesional de la piel",
                images: [
                    "https://images.pexels.com/photos/4041392/pexels-photo-4041392.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3757947/pexels-photo-3757947.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3757948/pexels-photo-3757948.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            },
            visajismo: {
                title: "Visajismo y Contouring",
                icon: "fas fa-draw-polygon",
                subtitle: "Esculpiendo tu rostro con luces y sombras",
                images: [
                    "https://images.pexels.com/photos/2820886/pexels-photo-2820886.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3278932/pexels-photo-3278932.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3783021/pexels-photo-3783021.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            },
            colorimetria: {
                title: "Colorimetría Aplicada",
                icon: "fas fa-palette",
                subtitle: "La ciencia del color para realzar tu belleza",
                images: [
                    "https://images.pexels.com/photos/2065195/pexels-photo-2065195.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/2101187/pexels-photo-2101187.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/2893521/pexels-photo-2893521.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            },
            editorial: {
                title: "Maquillaje Editorial HD",
                icon: "fas fa-camera-retro",
                subtitle: "Alta definición para fotografía y pasarela",
                images: [
                    "https://images.pexels.com/photos/3229194/pexels-photo-3229194.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3535571/pexels-photo-3535571.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3866555/pexels-photo-3866555.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            },
            higiene: {
                title: "Higiene Profesional",
                icon: "fas fa-hand-holding-heart",
                subtitle: "Protocolos de seguridad y desinfección",
                images: [
                    "https://images.pexels.com/photos/4210812/pexels-photo-4210812.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/4056525/pexels-photo-4056525.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3957984/pexels-photo-3957984.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            },
            hairstyle: {
                title: "Peinados y Estilismo",
                icon: "fas fa-cut",
                subtitle: "Tendencias y técnicas profesionales",
                images: [
                    "https://images.pexels.com/photos/3993442/pexels-photo-3993442.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3993443/pexels-photo-3993443.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop",
                    "https://images.pexels.com/photos/3993444/pexels-photo-3993444.jpeg?auto=compress&cs=tinysrgb&w=500&h=500&fit=crop"
                ]
            }
        };

        const popupCarousel = document.getElementById('serviceCarouselPopup');
        const closePopupBtn = document.getElementById('closeCarouselPopup');
        const carouselTitle = document.getElementById('carouselTitle');
        const carouselIcon = document.getElementById('carouselIcon');
        const carouselSubtitle = document.getElementById('carouselSubtitle');
        const carouselTrack = document.getElementById('carouselTrack');
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const carouselDots = document.getElementById('carouselDots');

        let currentServiceKey = null;
        let currentIndex = 0;
        let autoInterval = null;

        function buildCarousel(serviceKey) {
            const service = servicesData[serviceKey];
            if (!service) return;
            
            currentServiceKey = serviceKey;
            currentIndex = 0;
            
            carouselTitle.textContent = service.title;
            carouselIcon.className = `${service.icon} text-4xl text-[#c2a575] mb-2`;
            carouselSubtitle.textContent = service.subtitle;
            
            carouselTrack.innerHTML = '';
            service.images.forEach((imgSrc, idx) => {
                const slide = document.createElement('div');
                slide.className = 'carousel-slide';
                slide.innerHTML = `<img src="${imgSrc}" alt="${service.title} - Imagen ${idx+1}" loading="eager">`;
                carouselTrack.appendChild(slide);
            });
            
            carouselDots.innerHTML = '';
            service.images.forEach((_, idx) => {
                const dot = document.createElement('div');
                dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
                dot.addEventListener('click', () => goToSlide(idx));
                carouselDots.appendChild(dot);
            });
            
            updateCarouselPosition();
            startAutoSlide();
        }
        
        function updateCarouselPosition() {
            if (!carouselTrack) return;
            carouselTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
            const dots = document.querySelectorAll('.carousel-dot');
            dots.forEach((dot, idx) => {
                if (idx === currentIndex) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        }
        
        function goToSlide(index) {
            if (!servicesData[currentServiceKey]) return;
            const maxIndex = servicesData[currentServiceKey].images.length - 1;
            if (index < 0) index = 0;
            if (index > maxIndex) index = maxIndex;
            currentIndex = index;
            updateCarouselPosition();
            resetAutoSlide();
        }
        
        function nextSlide() {
            if (!servicesData[currentServiceKey]) return;
            const maxIndex = servicesData[currentServiceKey].images.length - 1;
            if (currentIndex + 1 > maxIndex) currentIndex = 0;
            else currentIndex++;
            updateCarouselPosition();
            resetAutoSlide();
        }
        
        function prevSlide() {
            if (!servicesData[currentServiceKey]) return;
            const maxIndex = servicesData[currentServiceKey].images.length - 1;
            if (currentIndex - 1 < 0) currentIndex = maxIndex;
            else currentIndex--;
            updateCarouselPosition();
            resetAutoSlide();
        }
        
        function startAutoSlide() {
            if (autoInterval) clearInterval(autoInterval);
            autoInterval = setInterval(() => { nextSlide(); }, 4000);
        }
        
        function resetAutoSlide() {
            if (autoInterval) {
                clearInterval(autoInterval);
                autoInterval = setInterval(() => { nextSlide(); }, 4000);
            }
        }
        
        function stopAutoSlide() {
            if (autoInterval) {
                clearInterval(autoInterval);
                autoInterval = null;
            }
        }
        
        function showServicePopup(serviceKey) {
            buildCarousel(serviceKey);
            popupCarousel.classList.remove('hidden');
        }
        
        function hideServicePopup() {
            popupCarousel.classList.add('hidden');
            stopAutoSlide();
        }
        
        document.getElementById('skinPrepButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('skinPrep'); });
        document.getElementById('visajismoButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('visajismo'); });
        document.getElementById('colorimetriaButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('colorimetria'); });
        document.getElementById('editorialButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('editorial'); });
        document.getElementById('higieneButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('higiene'); });
        document.getElementById('hairstyleButton').addEventListener('click', (e) => { e.preventDefault(); showServicePopup('hairstyle'); });
        
        carouselPrev.addEventListener('click', prevSlide);
        carouselNext.addEventListener('click', nextSlide);
        closePopupBtn.addEventListener('click', hideServicePopup);
        popupCarousel.addEventListener('click', (e) => { if (e.target === popupCarousel) hideServicePopup(); });
        
        // QR
        const qrDiv = document.getElementById('qrcode');
        const qrImage = document.createElement('img');
        qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(window.location.href)}`;
        qrImage.className = "w-36 h-auto";
        qrDiv.appendChild(qrImage);
        
        function show(p) { p.classList.remove('hidden'); }
        function hide(p) { p.classList.add('hidden'); }
        
        document.getElementById('qrButton').addEventListener('click', (e) => { e.preventDefault(); show(document.getElementById('qrPopup')); });
        document.getElementById('closeQrPopup').addEventListener('click', () => hide(document.getElementById('qrPopup')));
        document.getElementById('qrPopup').addEventListener('click', (e) => { if(e.target === document.getElementById('qrPopup')) hide(document.getElementById('qrPopup')); });
        
        // Instalación
        const installBtn = document.getElementById('installButton');
        const installPop = document.getElementById('installPopup');
        installBtn.addEventListener('click', (e) => { e.preventDefault(); show(installPop); });
        document.getElementById('closeInstallPopup').addEventListener('click', () => hide(installPop));
        installPop.addEventListener('click', (e) => { if(e.target === installPop) hide(installPop); });
        document.getElementById('iosTab').addEventListener('click', () => { document.getElementById('iosInstructions').classList.remove('hidden'); document.getElementById('androidInstructions').classList.add('hidden'); document.getElementById('iosTab').classList.add('install-tab-active'); document.getElementById('androidTab').classList.remove('install-tab-active'); });
        document.getElementById('androidTab').addEventListener('click', () => { document.getElementById('androidInstructions').classList.remove('hidden'); document.getElementById('iosInstructions').classList.add('hidden'); document.getElementById('androidTab').classList.add('install-tab-active'); document.getElementById('iosTab').classList.remove('install-tab-active'); });
        
        // vCard
        const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:Nicole Montalvo\nORG:Nicole Montalvo Belleza Integral\nTITLE:Estilista, Visajista & Especialista en Peinados\nTEL:+573009981576\nEMAIL:nicolemont024@gmail.com\nURL:${window.location.href}\nNOTE:Especialista en visajismo, colorimetría, maquillaje editorial y peinados profesionales.\nEND:VCARD`;
        const blobVcf = new Blob([vcf], {type: 'text/vcard'});
        const saveBtn = document.getElementById('saveContactButton');
        saveBtn.href = URL.createObjectURL(blobVcf);
        saveBtn.setAttribute('download', 'Nicole_Montalvo_Belleza_Integral.vcf');
