import { Player } from "@remotion/player";
import { useState, useEffect, useRef } from "react";
import PassportComposition from "./remotion/PassportComposition.jsx";
import "./styles/Dashboard.css";
import { startRender, getRenderStatus, getDownloadUrl, triggerDownload } from "../shared/utils/api.js";
import { getProgressPercentage, getButtonLabel, RENDER_STATUS } from "../shared/utils/renderStatus.js";
import { selectArchetype } from "./utils/archetypeSelection.js";
import {
  getCountryFlag,
  highlightMatch,
  PASSPORT_COMPOSITION_CONFIG,
  getInputStyle,
  inputFocusStyle,
  getStep1InputStyle,
  step1InputFocusStyle,
  getLabelStyle,
  fieldContainerStyle,
  ANIMATION_OPTIONS,
} from "./utils/passportDashboardHelpers.jsx";
import { loadDarkMode, saveDarkMode } from "../shared/utils/darkModeStorage.js";
import countriesData from "../countries.json";
import { gsap } from "gsap";

export default function PassportDashboard() {
  // Step-by-step flow state
  const [currentStep, setCurrentStep] = useState(1); // 1: Name, 2: Destination, 3: Preview
  
  const [name, setName] = useState("Ali");
  
  // Track if name has been manually edited (to prevent clearing on refocus)
  const nameEditedRef = useRef(false);
  
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [animationVariant, setAnimationVariant] = useState("Dark");
  
  // Render state management
  const [isRendering, setIsRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState(null);
  const [dotCount, setDotCount] = useState(1); // For animated dots
  const [renderMessage, setRenderMessage] = useState(null);
  const [lastRenderedVideoUrl, setLastRenderedVideoUrl] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [percentageUpdateTrigger, setPercentageUpdateTrigger] = useState(0); // Force re-render for percentage updates
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const pollingIntervalRef = useRef(null);
  const renderStartTimeRef = useRef(null); // Track when rendering started for time-based percentage
  const [fontLoaded, setFontLoaded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const lastFrameRef = useRef(null);
  const countryInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const videoContainerRef = useRef(null);
  const step1Ref = useRef(null);
  const step2Ref = useRef(null);
  const step3Ref = useRef(null);
  const step1HeadlineRef = useRef(null);
  const step1InputRef = useRef(null);
  const step1ButtonRef = useRef(null);
  const step2HeadlineRef = useRef(null);
  const step2InputRef = useRef(null);
  const step2ButtonRef = useRef(null);
  const step3HeadlineRef = useRef(null);
  const step3InputRef = useRef(null);
  const step3ButtonRef = useRef(null);
  const step3ShareButtonRef = useRef(null);
  const step3StatusCircleRef = useRef(null);
  
  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [videoGenerationConfirmed, setVideoGenerationConfirmed] = useState(false);
  
  // Hamburger menu state
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Calculate archetype and derived values
  const archetypeData = selectArchetype(selectedCountries);
  const { archetype, intent, derived } = archetypeData;
  const countryCount = derived.countryCount;
  const continentCount = derived.continentsVisited;

  // Calculate time-based percentage (0-100% over 5 minutes)
  const getTimeBasedPercentage = () => {
    if (!renderStartTimeRef.current) return 0;
    
    const elapsedSeconds = (Date.now() - renderStartTimeRef.current) / 1000;
    const totalSeconds = 5 * 60; // 5 minutes = 300 seconds
    const percentage = Math.min(100, Math.floor((elapsedSeconds / totalSeconds) * 100));
    return percentage;
  };

  // Initialize dark mode from localStorage
  useEffect(() => {
    const savedDarkMode = loadDarkMode();
    setIsDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event) => {
      // Check if click is outside the menu
      const menuButton = event.target.closest('[aria-label="Menu"]');
      const menuDropdown = event.target.closest('[style*="position: absolute"]');
      
      if (!menuButton && !menuDropdown) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isMenuOpen]);

  // Sync DOM class with isDarkMode state
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Wait for Poppins font to load
  useEffect(() => {
    if (document.fonts && document.fonts.load) {
      const loadFont = async () => {
        try {
          if (document.fonts.ready) {
            await document.fonts.ready;
          }
          await document.fonts.load('300 1em "Poppins"');
          setFontLoaded(true);
        } catch (error) {
          setTimeout(() => setFontLoaded(true), 300);
        }
      };
      loadFont();
    } else {
      setTimeout(() => setFontLoaded(true), 300);
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Handle download from email link (check for jobId in URL)
  useEffect(() => {
    const handleEmailDownload = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const jobId = urlParams.get('download');
      
      if (!jobId) {
        return; // No download parameter, continue normally
      }

      try {
        // Remove the parameter from URL to prevent re-triggering
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);

        // Fetch download URL and trigger download
        const downloadData = await getDownloadUrl(jobId);
        if (downloadData.downloadUrl) {
          // Extract filename from URL or use default
          const urlParts = downloadData.downloadUrl.split('/');
          const filename = urlParts[urlParts.length - 1].split('?')[0] || `passport-${jobId}.mp4`;
          
          // Use triggerDownload to properly handle the download
          await triggerDownload(downloadData.downloadUrl, filename);
        }
      } catch (error) {
        console.error('Failed to download from email link:', error);
        // Optionally show an error message to the user
        alert('We couldn\'t download your video. Please try again or contact support for help.');
      }
    };

    handleEmailDownload();
  }, []); // Run once on mount

  // Initialize and autoplay video when reaching step 3
  useEffect(() => {
    // Only autoplay when on step 3
    if (currentStep !== 3) {
      return;
    }

    const initializeAndPlay = () => {
      if (!playerRef.current) {
        setTimeout(initializeAndPlay, 100);
        return;
      }

      try {
        if (playerRef.current.seekTo && playerRef.current.play) {
          playerRef.current.seekTo(0);
          playerRef.current.play();
          lastFrameRef.current = 0;
          setIsInitialized(true);
          setIsPlaying(true);
          setHasPlayed(true);
        } else {
          setTimeout(initializeAndPlay, 100);
        }
      } catch (error) {
        setTimeout(initializeAndPlay, 100);
      }
    };

    // Always try to autoplay when entering step 3
    const initTimer = setTimeout(initializeAndPlay, 100);
    return () => clearTimeout(initTimer);
  }, [currentStep]);

  // Animate pulsing circle for status indicator (md+ only)
  useEffect(() => {
    if (!step3StatusCircleRef.current || !videoGenerationConfirmed || renderMessage?.type === "error") {
      return;
    }

    const circle = step3StatusCircleRef.current;
    const pulseAnimation = gsap.to(circle, {
      scale: 1.2,
      opacity: 0.6,
      duration: 1.2,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });

    return () => {
      pulseAnimation.kill();
    };
  }, [videoGenerationConfirmed, renderMessage]);

  // Update percentage every second while rendering
  useEffect(() => {
    if (!isRendering || renderMessage?.type === "error") {
      return;
    }

    const interval = setInterval(() => {
      setPercentageUpdateTrigger(prev => prev + 1);
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isRendering, renderMessage]);

  // Animate dots for "Generating…" text (md+ only)
  useEffect(() => {
    if (!isRendering || renderMessage?.type === "error") {
      setDotCount(1);
      return;
    }

    // Only animate if status is PROVISIONING, RENDERING, or UPLOADING
    const shouldAnimate = renderStatus === RENDER_STATUS.PROVISIONING || 
                          renderStatus === RENDER_STATUS.RENDERING || 
                          renderStatus === RENDER_STATUS.UPLOADING ||
                          (renderStatus === RENDER_STATUS.QUEUED);

    if (!shouldAnimate) {
      setDotCount(1);
      return;
    }

    const interval = setInterval(() => {
      setDotCount(prev => {
        if (prev >= 3) return 1;
        return prev + 1;
      });
    }, 500); // Change dots every 500ms

    return () => clearInterval(interval);
  }, [isRendering, renderStatus, renderMessage]);

  // Track frame position when paused
  useEffect(() => {
    if (!playerRef.current || !isInitialized || isPlaying) return;

    const trackFrame = () => {
      if (playerRef.current && !isPlaying) {
        try {
          const currentFrame = playerRef.current.getCurrentFrame();
          if (currentFrame !== undefined && currentFrame !== null) {
            lastFrameRef.current = currentFrame;
          }
        } catch (error) {
          // Ignore
        }
      }
    };

    const intervalId = setInterval(trackFrame, 100);
    trackFrame();

    return () => clearInterval(intervalId);
  }, [isPlaying, isInitialized]);

  // Maintain current frame when props change
  useEffect(() => {
    if (!playerRef.current || !isInitialized || isPlaying) return;

    const savedFrame = lastFrameRef.current;

    const restoreFrame = () => {
      if (playerRef.current && playerRef.current.seekTo && !isPlaying && savedFrame !== null && savedFrame > 0) {
        try {
          playerRef.current.seekTo(savedFrame);
        } catch (error) {
          // Ignore
        }
      }
    };

    restoreFrame();
    const timeout1 = setTimeout(restoreFrame, 0);
    const timeout2 = setTimeout(restoreFrame, 10);
    const timeout3 = setTimeout(restoreFrame, 50);
    const timeout4 = setTimeout(restoreFrame, 100);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearTimeout(timeout4);
    };
  }, [name, selectedCountries, animationVariant, isInitialized, isPlaying]);

  // Monitor playback state and handle looping
  useEffect(() => {
    if (!playerRef.current || !isInitialized) return;

    let previousFrame = -1;

    const checkPlaybackState = () => {
      if (!playerRef.current) return;

      try {
        const currentFrame = playerRef.current.getCurrentFrame();
        const totalFrames = PASSPORT_COMPOSITION_CONFIG.durationInFrames;
        
        const nearEndThreshold = totalFrames - 5;
        const frameJumped = previousFrame > 0 && currentFrame < previousFrame - 10;
        const wasNearEnd = previousFrame >= nearEndThreshold;
        
        // Loop when reaching the end
        if ((currentFrame >= totalFrames - 1) || (frameJumped && wasNearEnd && isPlaying)) {
          if (isPlaying && playerRef.current.seekTo) {
            // Loop: reset to beginning and continue playing
            playerRef.current.seekTo(0);
            lastFrameRef.current = 0;
            setIsCompleted(false);
          }
        }
        
        previousFrame = currentFrame;
      } catch (error) {
        // Ignore
      }
    };

    let intervalId;
    if (isPlaying) {
      intervalId = setInterval(checkPlaybackState, 100);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPlaying, isInitialized]);

  // GSAP animations for step transitions
  useEffect(() => {
    const currentStepRef = 
      currentStep === 1 ? step1Ref.current :
      currentStep === 2 ? step2Ref.current :
      step3Ref.current;

    if (currentStepRef) {
      // Fade in and slide up animation - faster for better responsiveness
      gsap.fromTo(currentStepRef, 
        {
          opacity: 0,
          y: 20
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.25,
          ease: "power2.out"
        }
      );
    }

    // Fade out previous steps - faster for better responsiveness
    const previousRefs = [
      currentStep !== 1 && step1Ref.current,
      currentStep !== 2 && step2Ref.current,
      currentStep !== 3 && step3Ref.current,
    ].filter(Boolean);

    previousRefs.forEach(ref => {
      if (ref) {
        gsap.to(ref, {
          opacity: 0,
          y: -20,
          duration: 0.2,
          ease: "power2.in"
        });
      }
    });
  }, [currentStep]);

  // GSAP animations for headline and input (consecutive appearance)
  useEffect(() => {
    if (currentStep === 1) {
      // Reset opacity for step 1 elements
      if (step1HeadlineRef.current) {
        gsap.set(step1HeadlineRef.current, { opacity: 0, y: 20 });
      }
      if (step1InputRef.current) {
        gsap.set(step1InputRef.current, { opacity: 0, y: 20 });
      }
      if (step1ButtonRef.current) {
        gsap.set(step1ButtonRef.current, { opacity: 0 });
      }

      // Create timeline for consecutive animations
      const tl = gsap.timeline();
      
      // Animate headline first
      if (step1HeadlineRef.current) {
        tl.to(step1HeadlineRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out"
        });
      }
      
      // Then animate input after headline with a delay
      if (step1InputRef.current) {
        tl.to(step1InputRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out"
        }, "-=0.2"); // Start slightly before headline finishes for smoother transition
      }
      
      // Then animate button opacity after input (with delay)
      if (step1ButtonRef.current) {
        tl.to(step1ButtonRef.current, {
          opacity: 1,
          duration: 0.6,
          ease: "power2.out"
        }); // Start immediately after input
      }
    } else if (currentStep === 2) {
      // Reset opacity for step 2 elements
      if (step2HeadlineRef.current) {
        gsap.set(step2HeadlineRef.current, { opacity: 0, y: 20 });
      }
      if (step2InputRef.current) {
        gsap.set(step2InputRef.current, { opacity: 0, y: 20 });
      }
      if (step2ButtonRef.current) {
        gsap.set(step2ButtonRef.current, { opacity: 0 });
      }

      // Create timeline for consecutive animations
      const tl = gsap.timeline();
      
      // Animate headline first
      if (step2HeadlineRef.current) {
        tl.to(step2HeadlineRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out"
        });
      }
      
      // Then animate input after headline with a delay
      if (step2InputRef.current) {
        tl.to(step2InputRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out"
        }, "-=0.2"); // Start slightly before headline finishes for smoother transition
      }
      
      // Then animate button opacity after input (with delay)
      if (step2ButtonRef.current) {
        tl.to(step2ButtonRef.current, {
          opacity: 1,
          duration: 0.6,
          ease: "power2.out"
        }); // Start immediately after input
      }
    } else if (currentStep === 3) {
      // Reset opacity for step 3 elements
      if (step3HeadlineRef.current) {
        gsap.set(step3HeadlineRef.current, { opacity: 0, y: 20 });
      }
      if (step3InputRef.current) {
        gsap.set(step3InputRef.current, { opacity: 0, y: 20 });
      }
      if (step3ButtonRef.current) {
        gsap.set(step3ButtonRef.current, { opacity: 0 });
      }
      if (step3ShareButtonRef.current) {
        gsap.set(step3ShareButtonRef.current, { opacity: 0 });
      }

      // Create timeline for consecutive animations
      const tl = gsap.timeline();
      
      // Animate headline first
      if (step3HeadlineRef.current) {
        tl.to(step3HeadlineRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out"
        });
      }
      
      // Then animate input after headline with a delay
      if (step3InputRef.current) {
        tl.to(step3InputRef.current, {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: "power2.out",
          onComplete: () => {
            // Clear transform after initial animation
            if (step3InputRef.current) {
              step3InputRef.current.style.transform = "";
            }
          }
        }, "-=0.2"); // Start slightly before headline finishes for smoother transition
      }
      
      // Then animate download button opacity after input (with delay)
      if (step3ButtonRef.current) {
        tl.to(step3ButtonRef.current, {
          opacity: 1,
          duration: 0.6,
          ease: "power2.out"
        }); // Start immediately after input
      }
      
      // Then animate share button opacity after download button with slight delay
      if (step3ShareButtonRef.current) {
        tl.to(step3ShareButtonRef.current, {
          opacity: 1,
          duration: 0.6,
          ease: "power2.out"
        }, "-=0.4"); // Start slightly before download button finishes
      }
    } else {
      // Fade out step 1 and step 2 elements when moving to step 3
      if (step1HeadlineRef.current) {
        gsap.to(step1HeadlineRef.current, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      if (step1InputRef.current) {
        gsap.to(step1InputRef.current, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      if (step1ButtonRef.current) {
        gsap.to(step1ButtonRef.current, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      if (step2HeadlineRef.current) {
        gsap.to(step2HeadlineRef.current, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      if (step2InputRef.current) {
        gsap.to(step2InputRef.current, {
          opacity: 0,
          y: 20,
          duration: 0.3,
          ease: "power2.in"
        });
      }
      if (step2ButtonRef.current) {
        gsap.to(step2ButtonRef.current, {
          opacity: 0,
          duration: 0.3,
          ease: "power2.in"
        });
      }
    }
  }, [currentStep]);

  // Country search suggestions
  useEffect(() => {
    if (!countrySearch.trim()) {
      setCountrySuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const searchTerm = countrySearch.toLowerCase();
    const searchTermOriginal = countrySearch;
    
    // Score and categorize matches
    const matches = Object.entries(countriesData)
      .filter(([code]) => !selectedCountries.includes(code))
      .map(([code, data]) => {
        const countryName = data.country;
        const countryNameLower = countryName.toLowerCase();
        
        let score = 0;
        let matchType = null;
        
        // Check exact match (highest priority)
        if (countryNameLower === searchTerm) {
          score = 1000;
          matchType = 'exact';
        }
        // Check "starts with" match (high priority)
        else if (countryNameLower.startsWith(searchTerm)) {
          score = 500;
          matchType = 'starts-with';
        }
        // Check if country name contains the search term (lower priority)
        else if (countryNameLower.includes(searchTerm)) {
          score = 100;
          matchType = 'contains';
        }
        // Check aliases
        else if (data.aliases?.some(alias => {
          const aliasLower = alias.toLowerCase();
          if (aliasLower === searchTerm) {
            score = 1000;
            matchType = 'exact-alias';
            return true;
          } else if (aliasLower.startsWith(searchTerm)) {
            score = 500;
            matchType = 'starts-with-alias';
            return true;
          } else if (aliasLower.includes(searchTerm)) {
            score = 100;
            matchType = 'contains-alias';
            return true;
          }
          return false;
        })) {
          // Score already set in the alias check
        }
        
        return {
          code,
          name: countryName,
          score,
          matchType,
        };
      })
      .filter(item => item.score > 0) // Only include matches
      .toSorted((a, b) => {
        // Sort by score (descending), then alphabetically
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 3) // Limit to 3 results
      .map(({ code, name }) => ({ code, name, searchTerm: searchTermOriginal }));

    setCountrySuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [countrySearch, selectedCountries]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        countryInputRef.current &&
        !countryInputRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handlePlayPause = (e) => {
    e.stopPropagation(); // Prevent triggering handlePlayerClick
    if (playerRef.current && !isPlaying) {
      // Only handle play - pause is handled by clicking the player container
      playerRef.current.play();
      setIsPlaying(true);
      setIsCompleted(false);
    }
  };

  const handlePlayerClick = (e) => {
    // Prevent event bubbling if clicking the button
    if (e.target.closest('button')) {
      return;
    }
    
    // Toggle play/pause when clicking anywhere on the player
    if (playerRef.current) {
      if (isPlaying) {
        // Pause the video
        playerRef.current.pause();
        setIsPlaying(false);
        try {
          const currentFrame = playerRef.current.getCurrentFrame();
          if (currentFrame !== undefined && currentFrame !== null) {
            lastFrameRef.current = currentFrame;
          }
        } catch (error) {
          // Ignore
        }
      } else {
        // Play the video
        playerRef.current.play();
        setIsPlaying(true);
        setIsCompleted(false);
      }
    }
  };

  const handleCountrySelect = (countryCode) => {
    if (!selectedCountries.includes(countryCode)) {
      setSelectedCountries([...selectedCountries, countryCode]);
    }
    setCountrySearch("");
    setShowSuggestions(false);
  };

  const handleCountryRemove = (countryCode) => {
    setSelectedCountries(selectedCountries.filter((code) => code !== countryCode));
  };

  const handleNextButtonClick = (e, nextStep) => {
    const button = e.currentTarget;
    
    // Validate step 2: require at least one country
    if (nextStep === 3 && selectedCountries.length === 0) {
      return; // Don't proceed if no countries selected
    }
    
    // Change step immediately for better responsiveness
    setCurrentStep(nextStep);
    
    // GSAP animation: quick scale down then up with bounce (continues after step change)
    gsap.to(button, {
      scale: 0.3,
      duration: 0.15,
      ease: "power3.in",
      onComplete: () => {
        gsap.to(button, {
          scale: 1.1,
          duration: 0.3,
          ease: "elastic.out(1, 0.5)",
          onComplete: () => {
            gsap.to(button, {
              scale: 1,
              duration: 0.1,
              ease: "power2.out"
            });
          }
        });
      }
    });
  };

  const handleBackButtonClick = (e, prevStep) => {
    const button = e.currentTarget;
    
    // Change step immediately for better responsiveness
    setCurrentStep(prevStep);
    
    // GSAP animation: quick scale down then up with bounce (continues after step change)
    gsap.to(button, {
      scale: 0.3,
      duration: 0.15,
      ease: "power3.in",
      onComplete: () => {
        gsap.to(button, {
          scale: 1.1,
          duration: 0.3,
          ease: "elastic.out(1, 0.5)",
          onComplete: () => {
            gsap.to(button, {
              scale: 1,
              duration: 0.1,
              ease: "power2.out"
            });
          }
        });
      }
    });
  };

  const handleDarkModeToggle = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    saveDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Email validation helper
  const validateEmail = (emailValue) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailValue);
  };

  // Handle opening email modal (mobile) or focusing email input (desktop)
  const handleDownloadClick = () => {
    if (isRendering) {
      return;
    }

    if (!name.trim()) {
      setRenderMessage({ type: "error", text: "Please enter a name" });
      return;
    }

    // On desktop (md+), focus the inline email input instead of opening modal
    if (windowWidth > 768 && currentStep === 3) {
      const emailInput = document.getElementById("email-desktop");
      if (emailInput) {
        emailInput.focus();
        return;
      }
    }

    // On mobile, open modal
    setShowEmailModal(true);
    setEmail("");
    setEmailError("");
    setVideoGenerationConfirmed(false);
  };

  // Recovery action: switch back to email form state (md+ only)
  const handleChangeEmail = () => {
    setVideoGenerationConfirmed(false);
    setEmailError("");
    setRenderMessage(null); // Clear any render messages
    
    // Wait for React to re-render, then reset and animate
    setTimeout(() => {
      // Kill any existing animations
      if (step3InputRef.current) {
        gsap.killTweensOf(step3InputRef.current);
      }
      if (step3ButtonRef.current) {
        gsap.killTweensOf(step3ButtonRef.current);
      }
      
      // Reset elements to initial state - ONLY clear GSAP transforms, preserve React inline styles
      if (step3InputRef.current) {
        const element = step3InputRef.current;
        // ONLY remove GSAP-added transforms, NOT layout styles (margin, padding, width, height)
        // These are set by React inline styles and must be preserved
        element.style.transform = "";
        element.style.webkitTransform = "";
        // Clear GSAP's clearProps if it was used
        gsap.set(element, { clearProps: "transform" });
        
        // CRITICAL FIX: Clear transform on the wrapper element that's causing the scale issue
        const wrapperEl = element.querySelector('.gradient-border-wrapper');
        if (wrapperEl) {
          wrapperEl.style.transform = "";
          wrapperEl.style.webkitTransform = "";
          gsap.set(wrapperEl, { clearProps: "transform", scale: 1 });
          // Kill any GSAP animations on the wrapper
          gsap.killTweensOf(wrapperEl);
        }
        
        // Reset to initial animation state (opacity only, no transform to avoid size issues)
        gsap.set(element, { opacity: 0 });
      }
      
      if (step3ButtonRef.current) {
        const element = step3ButtonRef.current;
        // ONLY remove GSAP-added transforms, NOT layout styles
        element.style.transform = "";
        element.style.webkitTransform = "";
        gsap.set(element, { clearProps: "transform" });
        // Reset to initial state
        gsap.set(element, { opacity: 0 });
      }
      
      // Small delay to ensure DOM is ready, then animate with opacity only (no transforms)
      setTimeout(() => {
        const tl = gsap.timeline();
        
        if (step3InputRef.current) {
          tl.to(step3InputRef.current, {
            opacity: 1,
            duration: 0.4,
            ease: "power2.out"
          }, "-=0.2");
        }
        
        if (step3ButtonRef.current) {
          tl.to(step3ButtonRef.current, {
            opacity: 1,
            duration: 0.4,
            ease: "power2.out"
          });
        }
        
        // Focus and select email input after animation starts
        setTimeout(() => {
          const emailInput = document.getElementById("email-desktop");
          if (emailInput) {
            emailInput.focus();
            emailInput.select();
          }
        }, 100);
      }, 10);
    }, 10);
  };

  // Handle Generate Video button in modal
  const handleGenerateVideo = async () => {
    // Validate email
    if (!email.trim()) {
      setEmailError("Please enter an email address");
      return;
    }

    if (!validateEmail(email.trim())) {
      setEmailError("Please enter a valid email address");
      return;
    }

    // Show confirmation message instead of closing modal
    setVideoGenerationConfirmed(true);
    setEmailError("");
    
    setIsRendering(true);
    setRenderMessage(null);
    setRenderStatus("QUEUED");
    renderStartTimeRef.current = Date.now(); // Record render start time

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      // Implicit user signup: Upsert user record with email and name from Step 1
      // This creates/updates the user profile when they download for the first time
      try {
        const signupResponse = await fetch('/api/user/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            displayName: name, // Name from Step 1
          }),
        });
        
        if (!signupResponse.ok) {
          console.warn('User signup failed, but continuing with render:', await signupResponse.text());
        }
      } catch (signupError) {
        // Log but don't block render if signup fails
        console.warn('User signup error, but continuing with render:', signupError);
      }

      const props = {
        name,
        selectedCountries,
        animationVariant,
        archetype,
        intent,
        countryCount,
        continentCount,
        width: PASSPORT_COMPOSITION_CONFIG.width,
        height: PASSPORT_COMPOSITION_CONFIG.height,
        email: email.trim(), // Pass email to backend
      };

      const renderData = await startRender(props);
      const jobId = renderData.jobId;

      const pollStatus = async () => {
        try {
          const statusData = await getRenderStatus(jobId);
          const status = statusData.status;
          setRenderStatus(status);
          
          if (status === "COMPLETED") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            try {
              const downloadData = await getDownloadUrl(jobId);
              setLastRenderedVideoUrl(downloadData.downloadUrl);
              
              // Don't auto-download - show success message that email will be sent
              setRenderMessage({ 
                type: "success", 
                text: "Video generated! We'll email it to you shortly." 
              });
              setIsRendering(false);
              // Keep renderStatus as COMPLETED so percentage shows 100%
              setRenderStatus(RENDER_STATUS.COMPLETED);
            } catch (downloadError) {
              setRenderMessage({ 
                type: "error", 
                text: "Your video is ready, but we couldn't send the email. Please check your email address or try downloading directly." 
              });
              setIsRendering(false);
              setRenderStatus(null);
            }
          } else if (status === "FAILED") {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            const errorMsg = statusData.error || statusData.errorMessage || "We couldn't create your video. Please try again or contact support if the issue persists.";
            setRenderMessage({ type: "error", text: errorMsg });
            setIsRendering(false);
            setRenderStatus(null);
          }
        } catch (pollError) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setRenderMessage({ type: "error", text: "We're having trouble checking on your video. Please refresh the page and try again." });
          setIsRendering(false);
          setRenderStatus(null);
        }
      };

      await pollStatus();
      pollingIntervalRef.current = setInterval(pollStatus, 2000);

    } catch (error) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setRenderMessage({ type: "error", text: "Something went wrong while creating your video. Please try again." });
      setIsRendering(false);
      setRenderStatus(null);
    }
  };

  const getPngThumbnailFromPlayer = async () => {
    // Target dimensions for the final canvas
    const targetWidth = PASSPORT_COMPOSITION_CONFIG.width; // 1080
    const targetHeight = PASSPORT_COMPOSITION_CONFIG.height; // 1920
    
    if (!playerRef.current && !videoContainerRef.current) {
      throw new Error("Player not initialized");
    }

    let canvas = null;
    let containerNode = null;
    
    // Try to get the container node from Player
    if (playerRef.current && typeof playerRef.current.getContainerNode === 'function') {
      try {
        containerNode = playerRef.current.getContainerNode();
      } catch (error) {
        console.error('[PASSPORT] Error getting container node:', error);
      }
    }
    
    // Check if flags exist - we'll use composite approach: SVG + overlay flags
    // Flag detection is dynamic and based on characteristics:
    // - Small divs (< 100px) containing images
    // - Absolutely positioned
    // This ensures it works with future player updates without hardcoding class names or IDs
    let hasFlags = false;
    let flagDivsWithImages = [];
    if (videoContainerRef.current) {
      const flagDivs = videoContainerRef.current.querySelectorAll('div');
      flagDivsWithImages = Array.from(flagDivs).filter(div => {
        const img = div.querySelector('img');
        if (!img) return false;
        const style = window.getComputedStyle(div);
        const rect = div.getBoundingClientRect();
        const isSmall = rect.width < 100 && rect.height < 100;
        const isAbsolute = style.position === 'absolute' || div.style.position === 'absolute';
        return isSmall && isAbsolute;
      });
      hasFlags = flagDivsWithImages.length > 0;
    }
    
    // Strategy 1: ALWAYS capture SVG first (it works reliably)
    // We'll overlay flags on top if they exist
    if (videoContainerRef.current) {
      const svgElement = videoContainerRef.current.querySelector('svg');
      if (svgElement) {
        try {
          // Get SVG dimensions
          const svgRect = svgElement.getBoundingClientRect();
          const svgWidth = svgElement.viewBox?.baseVal?.width || svgRect.width || targetWidth;
          const svgHeight = svgElement.viewBox?.baseVal?.height || svgRect.height || targetHeight;
          
          // Create a canvas and draw the SVG
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = targetWidth;
          tempCanvas.height = targetHeight;
          const ctx = tempCanvas.getContext('2d');
          
          if (ctx) {
            // Serialize SVG to data URL
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            // Create an image from the SVG
            const img = new Image();
            await new Promise((resolve, reject) => {
              img.onload = () => {
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                URL.revokeObjectURL(url);
                resolve();
              };
              img.onerror = reject;
              img.src = url;
            });
            
            canvas = tempCanvas;
          }
        } catch (error) {
          console.error('[PASSPORT] Error capturing SVG:', error);
        }
      }
    }
    
    // Strategy 2: Look for canvas elements
    // SKIP if flags exist - canvas won't include React elements (flags)
    if (!hasFlags && !canvas && videoContainerRef.current) {
      const allCanvases = videoContainerRef.current.querySelectorAll('canvas');
      if (allCanvases.length > 0) {
        // Find the largest canvas
        let bestCanvas = null;
        let bestScore = 0;
        for (const c of allCanvases) {
          const score = c.width * c.height;
          if (c.width === targetWidth && c.height === targetHeight) {
            bestCanvas = c;
            break;
          }
          if (score > bestScore) {
            bestScore = score;
            bestCanvas = c;
          }
        }
        canvas = bestCanvas || allCanvases[0];
      }
    }
    
    // Strategy 3: Composite approach - overlay flags on SVG canvas
    // If we have SVG canvas and flags exist, overlay flags on top
    // This ensures any React elements (flags) rendered on top of the Lottie animation are captured
    if (canvas && hasFlags && videoContainerRef.current && flagDivsWithImages.length > 0) {
      // Composite approach: overlay flags on the SVG canvas
      const renderElement = videoContainerRef.current;
      const renderRect = renderElement.getBoundingClientRect();
      
      // Calculate scale factors for positioning flags on target canvas
      const scaleX = targetWidth / renderRect.width;
      const scaleY = targetHeight / renderRect.height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw each flag on the canvas
        // Flags are detected dynamically: small divs (< 100px) with images, absolutely positioned
        for (const flagDiv of flagDivsWithImages) {
          const rect = flagDiv.getBoundingClientRect();
          const img = flagDiv.querySelector('img');
          const style = window.getComputedStyle(flagDiv);
          
          if (img && img.complete && img.naturalWidth > 0) {
            // Calculate position on target canvas
            const flagX = (rect.left - renderRect.left) * scaleX;
            const flagY = (rect.top - renderRect.top) * scaleY;
            const flagWidth = rect.width * scaleX;
            const flagHeight = rect.height * scaleY;
            
            // Get border width (1.3px for capture)
            const borderWidth = 1.3;
            const scaledBorderWidth = borderWidth * Math.max(scaleX, scaleY);
            
            // Calculate center and radius
            const centerX = flagX + flagWidth / 2;
            const centerY = flagY + flagHeight / 2;
            const radius = Math.min(flagWidth, flagHeight) / 2;
            
            // Draw white border circle first
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.restore();
            
            // Draw flag image with circular clipping (inside the border)
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius - scaledBorderWidth, 0, Math.PI * 2);
            ctx.clip();
            
            // Draw the flag image
            ctx.drawImage(img, flagX, flagY, flagWidth, flagHeight);
            ctx.restore();
          }
        }
      }
    } else if (!canvas && videoContainerRef.current) {
      // Fallback: Use html2canvas if SVG capture failed
      const renderElement = videoContainerRef.current;
      const renderRect = renderElement.getBoundingClientRect();
      
      // Fallback: Use html2canvas if SVG capture failed
      // This ensures we can still capture even if SVG method doesn't work
      // Improved flag detection: flags should be small circular divs (60px) with images, not the large container
      const flagDivs = renderElement.querySelectorAll('div');
      const flagDivsWithImages = Array.from(flagDivs).filter(div => {
        const img = div.querySelector('img');
        if (!img) return false;
        const style = window.getComputedStyle(div);
        const rect = div.getBoundingClientRect();
        // Flags are small circular divs (around 60px), not large containers
        // Also check if it's absolutely positioned
        const isSmall = rect.width < 100 && rect.height < 100;
        const isAbsolute = style.position === 'absolute' || div.style.position === 'absolute';
        return isSmall && isAbsolute;
      });
      
      // Check if html2canvas is available
      if (typeof window.html2canvas === 'undefined') {
        // Load html2canvas from CDN
        await new Promise((resolve, reject) => {
          if (document.querySelector('script[src*="html2canvas"]')) {
            const checkInterval = setInterval(() => {
              if (typeof window.html2canvas !== 'undefined') {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkInterval);
              reject(new Error('html2canvas load timeout'));
            }, 5000);
          } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load html2canvas'));
            document.head.appendChild(script);
          }
        });
      }
      
      try {
        // Calculate scale to capture at target resolution
        const scaleX = targetWidth / renderRect.width;
        const scaleY = targetHeight / renderRect.height;
        const captureScale = Math.max(scaleX, scaleY, 4);
        
        // Store original flag positions before cloning
        const originalFlagPositions = [];
        flagDivsWithImages.forEach((div, index) => {
          const rect = div.getBoundingClientRect();
          const img = div.querySelector('img');
          const pos = {
            index,
            left: rect.left - renderRect.left,
            top: rect.top - renderRect.top,
            width: rect.width,
            height: rect.height,
            imgSrc: img ? img.src : null
          };
          originalFlagPositions.push(pos);
        });
        
        // Capture the entire element including Lottie and React elements (flags)
        const capturedCanvas = await window.html2canvas(renderElement, {
          scale: captureScale,
          useCORS: true,
          allowTaint: true, // Allow taint to capture images/flags
          backgroundColor: null,
          logging: true, // Enable logging to debug
          foreignObjectRendering: true,
          // Ensure we capture everything including flags/images
          ignoreElements: () => false,
          // Don't remove container - we need it for absolute positioning
          removeContainer: false,
          // Capture all images and SVGs
          imageTimeout: 15000,
          // Important: capture beyond viewport to get absolutely positioned elements
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          x: 0,
          y: 0,
          width: renderRect.width,
          height: renderRect.height,
          // Use onclone to ensure flags (React elements) are visible
          onclone: (clonedDoc, clonedElement) => {
            // Detect flags in cloned DOM (small divs with images, absolutely positioned)
            const clonedDivs = clonedElement.querySelectorAll('div');
            const clonedSvg = clonedElement.querySelector('svg');
            const clonedFlagDivs = Array.from(clonedDivs).filter(div => {
              const img = div.querySelector('img');
              if (!img) return false;
              const rect = div.getBoundingClientRect();
              return rect.width < 100 && rect.height < 100; // Small divs only
            });
            
            // Ensure SVG is visible in clone
            if (clonedSvg) {
              clonedSvg.style.display = 'block';
              clonedSvg.style.visibility = 'visible';
              clonedSvg.style.opacity = '1';
              clonedSvg.style.position = 'relative';
              clonedSvg.style.zIndex = '1';
            }
            
            // Restore flag positions from original
            clonedFlagDivs.forEach((clonedDiv, index) => {
              if (index < originalFlagPositions.length) {
                const pos = originalFlagPositions[index];
                const clonedImg = clonedDiv.querySelector('img');
                
                // Only apply if image src matches (to ensure we're matching the right flag)
                if (clonedImg && (!pos.imgSrc || clonedImg.src === pos.imgSrc)) {
                  clonedDiv.style.position = 'absolute';
                  clonedDiv.style.display = 'flex';
                  clonedDiv.style.visibility = 'visible';
                  clonedDiv.style.opacity = '1';
                  clonedDiv.style.zIndex = '999999';
                  clonedDiv.style.left = pos.left + 'px';
                  clonedDiv.style.top = pos.top + 'px';
                  clonedDiv.style.width = pos.width + 'px';
                  clonedDiv.style.height = pos.height + 'px';
                  
                  clonedImg.style.display = 'block';
                  clonedImg.style.visibility = 'visible';
                  clonedImg.style.opacity = '1';
                  clonedImg.style.width = '100%';
                  clonedImg.style.height = '100%';
                  clonedImg.style.objectFit = 'cover';
                  clonedImg.style.borderRadius = '50%';
                }
              } else {
                // Fallback: make it visible anyway
                clonedDiv.style.position = 'absolute';
                clonedDiv.style.display = 'flex';
                clonedDiv.style.visibility = 'visible';
                clonedDiv.style.opacity = '1';
                clonedDiv.style.zIndex = '999999';
                const img = clonedDiv.querySelector('img');
                if (img) {
                  img.style.display = 'block';
                  img.style.visibility = 'visible';
                  img.style.opacity = '1';
                }
              }
            });
            
            // Make sure all images are visible
            const allImages = clonedElement.querySelectorAll('img');
            allImages.forEach(img => {
              img.style.display = 'block';
              img.style.visibility = 'visible';
              img.style.opacity = '1';
            });
            
            // Make sure all elements are visible
            const allElements = clonedElement.querySelectorAll('*');
            allElements.forEach(el => {
              const computedStyle = window.getComputedStyle(el);
              if (computedStyle.display === 'none') {
                el.style.display = 'block';
              }
              if (computedStyle.visibility === 'hidden') {
                el.style.visibility = 'visible';
              }
              if (computedStyle.opacity === '0') {
                el.style.opacity = '1';
              }
            });
          },
        });
        
        // Scale to target dimensions
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = targetWidth;
        finalCanvas.height = targetHeight;
        const ctx = finalCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
          canvas = finalCanvas;
        } else {
          canvas = capturedCanvas;
        }
      } catch (error) {
        console.error('[PASSPORT] html2canvas error:', error);
        throw error;
      }
    }
    
    if (!canvas) {
      let renderElement = null;
      
      // Try to find the Player's actual rendering container
      // The Player component renders inside videoContainerRef, we need to find its root
      if (videoContainerRef.current) {
        // The Player component should be the first (and only) direct child of videoContainerRef
        // But we need to go deeper to find the actual composition container
        // Look for the Remotion Player's internal structure
        let playerRoot = null;
        
        // Try multiple strategies to find the actual composition container
        // Strategy 1: Look for data-remotion-player attribute
        playerRoot = videoContainerRef.current.querySelector('[data-remotion-player]');
        
        // Strategy 2: Look for the div that contains SVG (the composition)
        if (!playerRoot) {
          const divsWithSVG = Array.from(videoContainerRef.current.querySelectorAll('div')).filter(div => {
            const svg = div.querySelector('svg');
            if (svg) {
              const rect = div.getBoundingClientRect();
              const aspectRatio = rect.width > 0 ? rect.height / rect.width : 0;
              const targetAspectRatio = targetHeight / targetWidth;
              // Check if this div has the right aspect ratio (composition aspect ratio)
              return Math.abs(aspectRatio - targetAspectRatio) < 0.2;
            }
            return false;
          });
          if (divsWithSVG.length > 0) {
            // Use the largest one or the one that matches dimensions best
            playerRoot = divsWithSVG.reduce((best, current) => {
              const bestArea = best.getBoundingClientRect().width * best.getBoundingClientRect().height;
              const currentArea = current.getBoundingClientRect().width * current.getBoundingClientRect().height;
              return currentArea > bestArea ? current : best;
            });
          }
        }
        
        // Strategy 3: Use the first child div that has significant content
        if (!playerRoot && videoContainerRef.current.firstElementChild) {
          playerRoot = videoContainerRef.current.firstElementChild;
        }
        
        // Strategy 4: Fallback to videoContainerRef itself
        if (!playerRoot) {
          playerRoot = videoContainerRef.current;
        }
        
        renderElement = playerRoot;
      } else if (containerNode && containerNode instanceof HTMLElement) {
        // Last resort: use containerNode
        renderElement = containerNode;
      } else {
        throw new Error("No render element available for capture");
      }
      
      if (!renderElement) {
        throw new Error("Could not find render element for capture");
      }
      
      const renderRect = renderElement.getBoundingClientRect();
      
      // Check if html2canvas is available (loaded via CDN)
      if (typeof window.html2canvas !== 'undefined') {
        try {
          // Calculate the scale needed to capture at target resolution
          const scaleX = targetWidth / renderRect.width;
          const scaleY = targetHeight / renderRect.height;
          // Use a higher scale factor (4x minimum) for better quality when scaling down
          // This captures at higher resolution and scales down, which preserves more detail
          const captureScale = Math.max(scaleX, scaleY, 4);
          
          // Capture the entire renderElement - use onclone to ensure we capture the full composition
          const capturedCanvas = await window.html2canvas(renderElement, {
            width: renderRect.width,
            height: renderRect.height,
            scale: captureScale, // Capture at high resolution
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            x: 0,
            y: 0,
            windowWidth: renderRect.width,
            windowHeight: renderRect.height,
            // Use onclone to ensure all elements are visible and properly rendered
            onclone: (clonedDoc, element) => {
              // Make sure all elements in the clone are visible
              const allElements = element.querySelectorAll('*');
              allElements.forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
                  el.style.display = 'block';
                  el.style.visibility = 'visible';
                }
              });
            },
            // Don't ignore any elements - capture everything
            ignoreElements: (element) => {
              return false;
            },
          });
          
          
          // Scale down from high-resolution capture to target dimensions
          // This preserves more detail than scaling up from a low-resolution capture
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = targetWidth;
          finalCanvas.height = targetHeight;
          const ctx = finalCanvas.getContext('2d');
          if (ctx) {
            // Use highest quality image scaling settings
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Use a two-pass scaling approach for better quality if the captured canvas is significantly larger
            if (capturedCanvas.width > targetWidth * 2 || capturedCanvas.height > targetHeight * 2) {
              // First pass: scale to intermediate size (2x target)
              const intermediateCanvas = document.createElement('canvas');
              intermediateCanvas.width = targetWidth * 2;
              intermediateCanvas.height = targetHeight * 2;
              const intermediateCtx = intermediateCanvas.getContext('2d');
              if (intermediateCtx) {
                intermediateCtx.imageSmoothingEnabled = true;
                intermediateCtx.imageSmoothingQuality = 'high';
                intermediateCtx.drawImage(capturedCanvas, 0, 0, targetWidth * 2, targetHeight * 2);
                // Second pass: scale from intermediate to final size
                ctx.drawImage(intermediateCanvas, 0, 0, targetWidth, targetHeight);
              } else {
                ctx.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
              }
            } else {
              // Single pass scaling
              ctx.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
            }
            canvas = finalCanvas;
          } else {
            canvas = capturedCanvas;
          }
          searchPath.push('html2canvas(renderElement)');
        } catch (html2canvasError) {
        }
      } else {
        // Load html2canvas from CDN if not available
        await new Promise((resolve, reject) => {
          if (document.querySelector('script[src*="html2canvas"]')) {
            // Already loading or loaded
            const checkInterval = setInterval(() => {
              if (typeof window.html2canvas !== 'undefined') {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkInterval);
              reject(new Error('html2canvas load timeout'));
            }, 5000);
          } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            script.onload = () => {
              resolve();
            };
            script.onerror = () => reject(new Error('Failed to load html2canvas'));
            document.head.appendChild(script);
          }
        });
        
        // Now try again with html2canvas
        try {
          const renderRectAfterLoad = renderElement.getBoundingClientRect();
          
          // Calculate the scale needed to capture at target resolution
          const scaleXAfterLoad = targetWidth / renderRectAfterLoad.width;
          const scaleYAfterLoad = targetHeight / renderRectAfterLoad.height;
          // Use a higher scale factor (4x minimum) for better quality when scaling down
          // This captures at higher resolution and scales down, which preserves more detail
          const captureScaleAfterLoad = Math.max(scaleXAfterLoad, scaleYAfterLoad, 4);
          
          // Capture the entire renderElement - use onclone to ensure we capture the full composition
          const capturedCanvas = await window.html2canvas(renderElement, {
            width: renderRectAfterLoad.width,
            height: renderRectAfterLoad.height,
            scale: captureScaleAfterLoad, // Capture at high resolution
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            x: 0,
            y: 0,
            windowWidth: renderRectAfterLoad.width,
            windowHeight: renderRectAfterLoad.height,
            // Use onclone to ensure all elements are visible and properly rendered
            onclone: (clonedDoc, element) => {
              // Make sure all elements in the clone are visible
              const allElements = element.querySelectorAll('*');
              allElements.forEach(el => {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
                  el.style.display = 'block';
                  el.style.visibility = 'visible';
                }
              });
            },
            // Don't ignore any elements - capture everything
            ignoreElements: (element) => {
              return false;
            },
          });
          
          
          // Scale down from high-resolution capture to target dimensions
          // This preserves more detail than scaling up from a low-resolution capture
          const finalCanvasAfterLoad = document.createElement('canvas');
          finalCanvasAfterLoad.width = targetWidth;
          finalCanvasAfterLoad.height = targetHeight;
          const ctxAfterLoad = finalCanvasAfterLoad.getContext('2d');
          if (ctxAfterLoad) {
            // Use highest quality image scaling settings
            ctxAfterLoad.imageSmoothingEnabled = true;
            ctxAfterLoad.imageSmoothingQuality = 'high';
            // Use a two-pass scaling approach for better quality if the captured canvas is significantly larger
            if (capturedCanvas.width > targetWidth * 2 || capturedCanvas.height > targetHeight * 2) {
              // First pass: scale to intermediate size (2x target)
              const intermediateCanvas = document.createElement('canvas');
              intermediateCanvas.width = targetWidth * 2;
              intermediateCanvas.height = targetHeight * 2;
              const intermediateCtx = intermediateCanvas.getContext('2d');
              if (intermediateCtx) {
                intermediateCtx.imageSmoothingEnabled = true;
                intermediateCtx.imageSmoothingQuality = 'high';
                intermediateCtx.drawImage(capturedCanvas, 0, 0, targetWidth * 2, targetHeight * 2);
                // Second pass: scale from intermediate to final size
                ctxAfterLoad.drawImage(intermediateCanvas, 0, 0, targetWidth, targetHeight);
              } else {
                ctxAfterLoad.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
              }
            } else {
              // Single pass scaling
              ctxAfterLoad.drawImage(capturedCanvas, 0, 0, targetWidth, targetHeight);
            }
            canvas = finalCanvasAfterLoad;
          } else {
            canvas = capturedCanvas;
          }
          searchPath.push('html2canvas(renderElement) after CDN load');
        } catch (html2canvasError) {
        }
      }
    }

    if (!canvas) {
      throw new Error("Canvas not found in player. Please ensure the player is fully loaded.");
    }

    
    // Ensure canvas is exactly 1080x1920 before converting to blob
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = targetWidth;
      resizedCanvas.height = targetHeight;
      const ctx = resizedCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
        canvas = resizedCanvas;
      }
    }


    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to blob"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });
  };

  const getPngThumbnailFromVideoUrl = async (videoUrl) => {
    const res = await fetch(videoUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch video: ${res.statusText}`);
    }
    const videoBlob = await res.blob();
    const objectUrl = URL.createObjectURL(videoBlob);

    try {
      const videoEl = document.createElement("video");
      videoEl.src = objectUrl;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.preload = "auto";

      await new Promise((resolve, reject) => {
        const onLoaded = () => resolve();
        const onError = () => reject(new Error("Failed to load video for thumbnail"));
        videoEl.addEventListener("loadedmetadata", onLoaded, { once: true });
        videoEl.addEventListener("error", onError, { once: true });
      });

      const targetTime = Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? Math.min(videoEl.duration * 0.5, Math.max(0, videoEl.duration - 0.1))
        : 0;

      await new Promise((resolve) => {
        const onSeeked = () => resolve();
        videoEl.addEventListener("seeked", onSeeked, { once: true });
        try {
          videoEl.currentTime = targetTime;
        } catch {
          resolve();
        }
      });

      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth || PASSPORT_COMPOSITION_CONFIG.width;
      canvas.height = videoEl.videoHeight || PASSPORT_COMPOSITION_CONFIG.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Could not create canvas context");
      }
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const pngBlob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png");
      });

      if (!pngBlob) {
        throw new Error("Failed to encode thumbnail");
      }

      return pngBlob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  /**
   * Capture thumbnail from Remotion Player and share to Instagram Story
   */
  const handleShareToStory = async () => {
    try {
      // Try to capture from player first (preferred method)
      let pngBlob;
      if ((playerRef.current || videoContainerRef.current) && isInitialized) {
        // Save current state
        const savedFrame = lastFrameRef.current || 0;
        const wasPlaying = isPlaying;
        const targetFrame = 400;
        
        // Pause the player first to ensure stable frame
        if (playerRef.current && playerRef.current.pause) {
          playerRef.current.pause();
          setIsPlaying(false);
        }
        
        // Seek to frame 400 before capturing
        if (playerRef.current && playerRef.current.seekTo) {
          playerRef.current.seekTo(targetFrame);
          lastFrameRef.current = targetFrame;
          
          // Wait for frame to render (longer delay to ensure frame is fully rendered)
          // Remotion needs time to render the frame, especially if it's far from current position
          await new Promise(resolve => setTimeout(resolve, 800));
          
          // Wait for all images (including flags) to load before capturing
          if (videoContainerRef.current) {
            const allImages = videoContainerRef.current.querySelectorAll('img');
            if (allImages.length > 0) {
              await Promise.all(
                Array.from(allImages).map(img => {
                  if (img.complete && img.naturalWidth > 0) {
                    return Promise.resolve();
                  }
                  return new Promise((resolve) => {
                    if (img.complete) {
                      resolve();
                      return;
                    }
                    img.onload = () => resolve();
                    img.onerror = () => resolve(); // Resolve even on error to not block
                    // Force reload if src is set but not loaded
                    if (img.src && !img.complete) {
                      const src = img.src;
                      img.src = '';
                      img.src = src;
                    }
                    setTimeout(resolve, 3000); // Timeout after 3 seconds
                  });
                })
              );
              // Additional delay to ensure everything is painted and rendered
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }
        
        // Capture thumbnail from frame 400
        pngBlob = await getPngThumbnailFromPlayer();
        
        // Restore playback state if it was playing
        if (wasPlaying && playerRef.current && playerRef.current.play) {
          playerRef.current.play();
          setIsPlaying(true);
        }
        
        // Restore previous frame position (optional - uncomment if you want to restore)
        // if (playerRef.current && playerRef.current.seekTo) {
        //   playerRef.current.seekTo(savedFrame);
        //   lastFrameRef.current = savedFrame;
        // }
      } else if (lastRenderedVideoUrl) {
        // Fallback to video URL if player not available
        pngBlob = await getPngThumbnailFromVideoUrl(lastRenderedVideoUrl);
      } else {
        setRenderMessage({ type: "error", text: "Please wait a moment for your video to load before sharing." });
        return;
      }
      const file = new File([pngBlob], "passport-thumbnail.png", { type: "image/png" });

      // Best option: native share sheet (pick Instagram Story)
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Passport" });
        return;
      }

      // Fallback: download image and try to open Instagram
      const blobUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "passport-thumbnail.png";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 200);

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      if (isIOS) {
        window.location.href = "instagram-stories://share";
      } else if (isAndroid) {
        window.location.href = "intent://share/#Intent;package=com.instagram.android;scheme=https;end";
      }
    } catch (error) {
      console.error('[PASSPORT] Share to story failed:', error);
    }
  };

  const isMobile = windowWidth <= 768;

  return (
    <>
      <style>{`
        @property --angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        
        @keyframes rotate-angle {
          to {
            --angle: 360deg;
          }
        }
        
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes menuBackdropFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: isMobile ? "100dvh" : "100vh",
        height: isMobile ? "100dvh" : (currentStep === 3 ? "100vh" : "auto"),
        width: "100%",
        backgroundColor: isDarkMode ? "#1e1e1e" : "#f7f8f9",
        overflow: currentStep === 3 ? "hidden" : "auto",
        boxSizing: "border-box",
        transition: "background-color 0.2s",
        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
        fontWeight: 400,
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          width: "100%",
          maxWidth: windowWidth <= 768 ? "100%" : "1400px",
          minHeight: windowWidth <= 768 ? "clamp(64px, 12vw, 96px)" : "clamp(78px, 12vw, 110px)",
          paddingTop: windowWidth <= 768 ? "clamp(12px, 2vw, 18px)" : "clamp(14px, 2vw, 22px)",
          paddingBottom: windowWidth <= 768 ? "0px" : "0px",
          paddingLeft: windowWidth <= 768 ? "clamp(10px, 2vw, 20px)" : "clamp(20px, 4vw, 60px)",
          paddingRight: windowWidth <= 768 ? "clamp(10px, 2vw, 20px)" : "clamp(20px, 4vw, 60px)",
          backgroundColor: isDarkMode ? "#1e1e1e" : "#f7f8f9",
          boxSizing: "border-box",
          flexShrink: 0,
          overflow: "visible",
          borderBottom: "0px solid #e5e7eb",
          position: "relative",
          zIndex: 100,
          transition: "background-color 0.2s",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: windowWidth <= 768 ? "4px" : "8px",
          }}
        >
          <button
            type="button"
            className="logo-button"
            onClick={() => setCurrentStep(1)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              margin: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              outline: "none",
            }}
          >
            <img
              src="/namat-combined.svg"
              alt="Namat Logo"
              style={{
                height: windowWidth <= 768 ? "clamp(40px, 8vw, 60px)" : "clamp(50px, 8vw, 70px)",
                width: "auto",
                maxWidth: "100%",
                display: "block",
                margin: 0,
                opacity: isDarkMode ? 0.8 : 1,
                filter: isDarkMode ? "brightness(0) invert(1)" : "none",
                transition: "opacity 0.2s, filter 0.2s",
              }}
            />
          </button>
          <div
            style={{
              padding: windowWidth <= 768 ? "2px 6px" : "4px 10px",
              borderRadius: "9999px",
              border: `1px solid ${isDarkMode ? "#4a4a4a" : "#9ca3af"}`,
              backgroundColor: "transparent",
              color: isDarkMode ? "#e5e7eb" : "#4b5563",
              fontSize: windowWidth <= 768 ? "0.6875rem" : "0.8125rem",
              fontWeight: "500",
              cursor: "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              position: "relative",
              zIndex: 11,
              transition: "border-color 0.2s, color 0.2s",
            }}
          >
            Passport <span style={{ color: isDarkMode ? "#efe7fd" : "#6000FF", fontSize: windowWidth <= 768 ? "0.5rem" : "0.6rem" }}>Demo</span>
          </div>
        </div>
        {windowWidth <= 768 ? (
          /* Mobile: Hamburger Menu */
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Menu"
              aria-expanded={isMenuOpen}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                border: `1.5px solid ${isMenuOpen ? "#6000FF" : (isDarkMode ? "#4a4a4a" : "#e5e7eb")}`,
                backgroundColor: isMenuOpen ? (isDarkMode ? "#2a1a4a" : "#efe7fd") : (isDarkMode ? "#2a2a2a" : "#ffffff"),
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
                padding: 0,
                boxShadow: isMenuOpen ? "0 4px 12px rgba(96, 0, 255, 0.15)" : "none",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isMenuOpen) {
                  e.currentTarget.style.backgroundColor = isDarkMode ? "#4a4a4a" : "#f9fafb";
                  e.currentTarget.style.borderColor = "#6000FF";
                }
              }}
              onMouseLeave={(e) => {
                if (!isMenuOpen) {
                  e.currentTarget.style.backgroundColor = isDarkMode ? "#2a2a2a" : "#ffffff";
                  e.currentTarget.style.borderColor = isDarkMode ? "#4a4a4a" : "#e5e7eb";
                }
              }}
            >
              {isMenuOpen ? (
                /* X icon - two clean diagonal lines */
                <>
                  <div style={{
                    position: "absolute",
                    width: "20px",
                    height: "2px",
                    backgroundColor: "#6000FF",
                    borderRadius: "2px",
                    transform: "rotate(45deg)",
                  }} />
                  <div style={{
                    position: "absolute",
                    width: "20px",
                    height: "2px",
                    backgroundColor: "#6000FF",
                    borderRadius: "2px",
                    transform: "rotate(-45deg)",
                  }} />
                </>
              ) : (
                /* Hamburger icon - three bars */
                <>
                  <div style={{
                    width: "18px",
                    height: "2px",
                    backgroundColor: isDarkMode ? "#e5e7eb" : "#4b5563",
                    borderRadius: "2px",
                    position: "absolute",
                    top: "13px",
                  }} />
                  <div style={{
                    width: "18px",
                    height: "2px",
                    backgroundColor: isDarkMode ? "#e5e7eb" : "#4b5563",
                    borderRadius: "2px",
                    position: "absolute",
                    top: "21px",
                  }} />
                  <div style={{
                    width: "18px",
                    height: "2px",
                    backgroundColor: isDarkMode ? "#e5e7eb" : "#4b5563",
                    borderRadius: "2px",
                    position: "absolute",
                    top: "29px",
                  }} />
                </>
              )}
            </button>

            {/* Centered overlay menu */}
            {isMenuOpen && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px",
                  boxSizing: "border-box",
                }}
              >
                {/* Backdrop */}
                <div
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: isDarkMode ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.4)",
                    animation: "menuBackdropFade 0.2s ease-out",
                  }}
                />
                {/* Menu panel - matches page style */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "320px",
                    backgroundColor: isDarkMode ? "#1e1e1e" : "#f7f8f9",
                    border: `1px solid ${isDarkMode ? "#333333" : "#e5e7eb"}`,
                    borderRadius: "20px",
                    boxShadow: isDarkMode 
                      ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" 
                      : "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
                    padding: "20px",
                    animation: "slideDown 0.25s ease-out",
                  }}
                >
                <a
                  href="https://platform.namat.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: isDarkMode ? "#e5e7eb" : "#4b5563",
                    textDecoration: "none",
                    display: "block",
                    padding: "14px 18px",
                    borderRadius: "12px",
                    transition: "background-color 0.2s, color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? "#333333" : "#e5e7eb";
                    e.currentTarget.style.color = "#6000FF";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = isDarkMode ? "#e5e7eb" : "#4b5563";
                  }}
                >
                  My Renders
                </a>

                <a
                  href="https://namat.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: isDarkMode ? "#e5e7eb" : "#6000FF",
                    backgroundColor: isDarkMode ? "transparent" : "#efe7fd",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    borderRadius: "12px",
                    marginTop: "8px",
                    border: `1px solid ${isDarkMode ? "#4a4a4a" : "#6000FF"}`,
                    transition: "background-color 0.2s, border-color 0.2s, color 0.2s, transform 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? "#333333" : "#efe7fd";
                    e.currentTarget.style.borderColor = "#6000FF";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? "transparent" : "#efe7fd";
                    e.currentTarget.style.borderColor = isDarkMode ? "#4a4a4a" : "#6000FF";
                  }}
                >
                  Namat
                  <span style={{ marginLeft: "4px", fontSize: "0.75rem" }}>&gt;</span>
                </a>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    borderRadius: "12px",
                    marginTop: "8px",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDarkMode ? "#333333" : "#e5e7eb";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                      fontSize: "0.9375rem",
                      fontWeight: 500,
                      color: isDarkMode ? "#e5e7eb" : "#4b5563",
                    }}
                  >
                    Dark Mode
                  </span>
                  <button
                    type="button"
                    onClick={handleDarkModeToggle}
                    aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    style={{
                      width: "52px",
                      height: "28px",
                      borderRadius: "9999px",
                      border: "none",
                      backgroundColor: isDarkMode ? "#4a4a4a" : "#e5e7eb",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background-color 0.3s",
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "3px",
                        left: isDarkMode ? "calc(100% - 25px)" : "3px",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        backgroundColor: "#ffffff",
                        transition: "left 0.3s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isDarkMode ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#6000FF" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="12" cy="12" r="5" fill="#6000FF" />
                          <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42m12.72-12.72 1.42-1.42" stroke="#6000FF" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Desktop: Original Layout */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <a
              href="https://platform.namat.io/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: isDarkMode ? "#e5e7eb" : "#4b5563",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "color 0.2s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#6000FF";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isDarkMode ? "#e5e7eb" : "#4b5563";
              }}
            >
              My Renders
            </a>
            <a
              href="https://namat.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: isDarkMode ? "#e5e7eb" : "#6000FF",
                padding: "0 14px",
                borderRadius: "9999px",
                backgroundColor: isDarkMode ? "transparent" : "#efe7fd",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                height: "32px",
                border: `1px solid ${isDarkMode ? "#4a4a4a" : "#6000FF"}`,
                transition: "background-color 0.2s, border-color 0.2s, color 0.2s, transform 0.1s",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDarkMode ? "#333333" : "#efe7fd";
                e.currentTarget.style.borderColor = "#6000FF";
                e.currentTarget.style.transform = "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isDarkMode ? "transparent" : "#efe7fd";
                e.currentTarget.style.borderColor = isDarkMode ? "#4a4a4a" : "#6000FF";
                e.currentTarget.style.transform = "scale(1)";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1.02)";
              }}
            >
              Namat
              <span style={{ fontSize: "0.75rem" }}>&gt;</span>
            </a>
            <button
              type="button"
              onClick={handleDarkModeToggle}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                width: "56px",
                height: "32px",
                borderRadius: "9999px",
                border: "none",
                backgroundColor: isDarkMode ? "#4a4a4a" : "#e5e7eb",
                cursor: "pointer",
                position: "relative",
                transition: "background-color 0.3s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "4px",
                  left: isDarkMode ? "calc(100% - 28px)" : "4px",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundColor: "#ffffff",
                  transition: "left 0.3s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isDarkMode ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#6000FF" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="5" fill="#6000FF" />
                    <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42m12.72-12.72 1.42-1.42" stroke="#6000FF" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                )}
              </div>
            </button>
          </div>
        )}
      </header>
      
      {/* Progress Indicator - Instagram Story style (clickable) */}
      <div
        style={{
          display: "flex",
          gap: "3px",
          padding: windowWidth <= 768 ? "4px 14px" : "6px 20px",
          width: "100%",
          maxWidth: windowWidth <= 768 ? "100%" : "1400px",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {[1, 2, 3].map((step) => {
          const isClickable = step <= currentStep;
          const isActive = step === currentStep;
          return (
            <div
              key={step}
              onClick={() => {
                if (isClickable) {
                  setCurrentStep(step);
                }
              }}
              style={{
                flex: 1,
                height: "2px",
                borderRadius: "1px",
                backgroundColor: isDarkMode ? "rgba(58, 58, 58, 0.4)" : "rgba(229, 231, 235, 0.5)",
                overflow: "hidden",
                position: "relative",
                cursor: isClickable ? "pointer" : "default",
                transition: "transform 0.2s ease",
                transformOrigin: "center",
              }}
              onMouseEnter={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = "scaleY(2)";
                  // Update the filled portion to purple
                  const filledDiv = e.currentTarget.querySelector('div');
                  if (filledDiv) {
                    filledDiv.style.backgroundColor = "#6000FF";
                  }
                }
              }}
              onMouseLeave={(e) => {
                if (isClickable) {
                  e.currentTarget.style.transform = "scaleY(1)";
                  // Restore original color
                  const filledDiv = e.currentTarget.querySelector('div');
                  if (filledDiv) {
                    filledDiv.style.backgroundColor = isDarkMode ? "rgba(229, 231, 235, 0.6)" : "rgba(107, 114, 128, 0.5)";
                  }
                }
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: step <= currentStep ? "100%" : "0%",
                  backgroundColor: isDarkMode ? "rgba(229, 231, 235, 0.6)" : "rgba(107, 114, 128, 0.5)",
                  transition: "width 0.3s ease, backgroundColor 0.2s ease",
                  borderRadius: "1px",
                }}
              />
            </div>
          );
        })}
      </div>
      
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "100%",
          flex: currentStep === 3 ? "1 1 0" : "1 1 auto",
          minHeight: currentStep === 3 ? "0" : (isMobile ? "0" : "auto"),
          height: currentStep === 3 ? "100%" : "auto",
          marginTop: windowWidth <= 768 ? "clamp(12px, 2.5vw, 20px)" : "clamp(6px, 1.5vw, 20px)",
          boxSizing: "border-box",
        }}
      >
        <div
          className="app-container"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: isMobile ? "flex-start" : "flex-start",
            flex: "1 1 auto",
            width: "100%",
            minHeight: currentStep === 3 ? "0" : (isMobile ? "0" : "auto"),
            height: currentStep === 3 ? "100%" : "auto",
            maxHeight: isMobile ? "100%" : "none",
            paddingLeft: windowWidth <= 768 ? "clamp(10px, 2vw, 20px)" : "clamp(20px, 4vw, 60px)",
            paddingRight: windowWidth <= 768 ? "clamp(10px, 2vw, 20px)" : "clamp(20px, 4vw, 60px)",
            paddingTop: "0px",
            paddingBottom: windowWidth <= 768 ? "clamp(10px, 2vw, 15px)" : "clamp(12px, 2vw, 20px)",
            marginTop: currentStep === 3 ? (windowWidth <= 768 ? "-10px" : "-12px") : (windowWidth <= 768 ? "clamp(-6px, -1.2vw, -4px)" : "clamp(-8px, -1.2vw, -6px)"),
            boxSizing: "border-box",
            backgroundColor: isDarkMode ? "#1e1e1e" : "#f7f8f9",
            overflow: "visible",
            position: "relative",
            zIndex: 1,
            transition: "background-color 0.2s",
          }}
        >
          <div
            className="shared-container"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: (currentStep === 3 && isMobile) ? "center" : (currentStep === 3 ? "flex-start" : "center"),
              backgroundColor: "transparent",
              width: "100%",
              maxWidth: windowWidth <= 768 ? "100%" : "1200px",
              boxSizing: "border-box",
              overflow: "visible",
              padding: currentStep === 3 
                ? (windowWidth <= 768 ? "clamp(6px, 0.8vw, 10px) clamp(20px, 3.5vw, 28px)" : "clamp(6px, 0.8vw, 10px) clamp(24px, 4vw, 40px)")
                : (windowWidth <= 768 ? "clamp(20px, 3.5vw, 28px)" : "clamp(24px, 4vw, 40px)"),
              minHeight: currentStep === 3 ? "0" : ((currentStep === 3 && isMobile) ? (windowWidth <= 768 ? "60vh" : "70vh") : (currentStep === 3 ? "auto" : (windowWidth <= 768 ? "60vh" : "70vh"))),
              height: currentStep === 3 ? "100%" : "auto",
              flex: currentStep === 3 ? "1 1 0" : "0 0 auto",
              position: "relative",
            }}
          >
            {/* Step 1: Name Input */}
            {currentStep === 1 && (
              <div
                ref={step1Ref}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  maxWidth: "500px",
                  gap: "20px",
                }}
              >
                <h2
                  ref={step1HeadlineRef}
                  style={{
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: "clamp(1.3rem, 3.5vw, 1.75rem)",
                    color: isDarkMode ? "#e5e7eb" : "#0a0716",
                    textAlign: "center",
                    margin: 0,
                    marginBottom: "20px",
                    opacity: 0,
                  }}
                >
                  Let's start with your name
                </h2>
                <div ref={step1InputRef} style={{ ...fieldContainerStyle, width: "100%", opacity: 0, gap: "6px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {/* Glowing gradient border wrapper using @property + background-clip technique */}
                <div
                  className="flex-1 gradient-border-wrapper"
                  style={{
                    height: "52px",
                    minWidth: 0,
                    "--bg-color": isDarkMode ? "#333333" : "#f0f1f3",
                    "--page-bg-color": isDarkMode ? "#666666" : "#f7f8f9",
                  }}
                >
                  <input
                    type="text"
                    id="name"
                    aria-label="What should we call you?"
                    value={name}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value.length <= 12) {
                        setName(value);
                        nameEditedRef.current = true; // Mark as edited
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && name.trim()) {
                        e.preventDefault();
                        setCurrentStep(2);
                      }
                    }}
                    placeholder="Enter name"
                    maxLength={12}
                    style={{
                      ...getInputStyle(isDarkMode, windowWidth <= 768),
                      flex: 1,
                      height: "100%",
                      minWidth: 0,
                      borderRadius: "9999px",
                      padding: "12px 16px 12px 20px",
                      border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                      backgroundColor: isDarkMode ? "#333333" : "#f0f1f3",
                      boxShadow: "none",
                      fontSize: windowWidth <= 768 ? "16px" : "0.9375rem",
                    }}
                    onFocus={(e) => {
                      e.target.style.outline = "none";
                      // Only clear "Ali" if it's the default and hasn't been edited
                      if (name === "Ali" && !nameEditedRef.current) {
                        setName("");
                      }
                    }}
                    onBlur={(e) => {
                      e.target.style.outline = "none";
                    }}
                    autoFocus
                  />
                </div>
                  <button
                    ref={step1ButtonRef}
                    type="button"
                    onClick={(e) => {
                      if (name.trim()) {
                        handleNextButtonClick(e, 2);
                      }
                    }}
                    disabled={!name.trim()}
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "50%",
                      border: `0.5px solid ${name.trim() ? "#6000FF" : "#9ca3af"}`,
                      backgroundColor: name.trim() ? "#efe7fd" : "#f3f4f6",
                      color: name.trim() ? "#6000FF" : "#9ca3af",
                      cursor: name.trim() ? "pointer" : "not-allowed",
                      transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      padding: 0,
                      opacity: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (name.trim()) {
                        e.currentTarget.style.backgroundColor = "#efe7fd";
                        e.currentTarget.style.borderColor = "#4B00C7";
                        e.currentTarget.style.color = "#4B00C7";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (name.trim()) {
                        e.currentTarget.style.backgroundColor = "#efe7fd";
                        e.currentTarget.style.borderColor = "#6000FF";
                        e.currentTarget.style.color = "#6000FF";
                      }
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
              </div>
              {/* Helper text */}
              <p
                style={{
                  fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                  fontSize: "0.75rem",
                  color: isDarkMode ? "#9ca3af" : "#6b7280",
                  margin: 0,
                  paddingLeft: "4px",
                  textAlign: "left",
                  marginTop: "2px",
                  fontStyle: "italic",
                }}
              >
                This will appear on your Passport
              </p>
              </div>
              </div>
            )}

            {/* Step 2: Destination Input */}
            {currentStep === 2 && (
              <div
                ref={step2Ref}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  maxWidth: "500px",
                  gap: "24px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: 1,
                    gap: "20px",
                  }}
                >
                <h2
                  ref={step2HeadlineRef}
                  style={{
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    fontWeight: 600,
                    fontSize: "clamp(1.3rem, 3.5vw, 1.75rem)",
                    color: isDarkMode ? "#e5e7eb" : "#0a0716",
                    textAlign: "center",
                    margin: 0,
                    marginBottom: "20px",
                    opacity: 0,
                  }}
                >
                  Where have you been so far, {name}?
                </h2>
                <div ref={step2InputRef} style={{ ...fieldContainerStyle, width: "100%", position: "relative", opacity: 0 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {/* Input container wrapper for positioning dropdown and labels */}
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      position: "relative",
                    }}
                  >
                  {/* Glowing gradient border wrapper using @property + background-clip technique */}
                  <div
                    className="flex-1 gradient-border-wrapper"
                    style={{
                      height: "52px",
                      minWidth: 0,
                      position: "relative",
                      "--bg-color": isDarkMode ? "#333333" : "#f0f1f3",
                      "--page-bg-color": isDarkMode ? "#666666" : "#f7f8f9",
                    }}
                    ref={countryInputRef}
                  >
                      <input
                        type="text"
                        id="countries"
                        aria-label="Where have you traveled so far?"
                        value={countrySearch}
                        onChange={(e) => {
                          setCountrySearch(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            // If suggestions are showing and there's a first suggestion, select it
                            if (showSuggestions && countrySuggestions.length > 0) {
                              handleCountrySelect(countrySuggestions[0].code);
                            } else if (selectedCountries.length > 0) {
                              // Only advance to next step if at least one country is selected
                              setCurrentStep(3);
                            }
                          }
                        }}
                        onFocus={(e) => {
                          e.target.style.outline = "none";
                          if (countrySuggestions.length > 0) {
                            setShowSuggestions(true);
                          }
                        }}
                        placeholder="Start typing a country…"
                        style={{
                          ...getInputStyle(isDarkMode, windowWidth <= 768),
                          flex: 1,
                          height: "100%",
                          minWidth: 0,
                          borderRadius: "9999px",
                          padding: "12px 40px 12px 20px",
                          border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                          backgroundColor: isDarkMode ? "#333333" : "#f0f1f3",
                          boxShadow: "none",
                          fontSize: windowWidth <= 768 ? "16px" : "0.9375rem",
                        }}
                        onBlur={(e) => {
                          e.target.style.outline = "none";
                        }}
                        autoFocus
                      />
                      {/* Chevron Icon */}
                      <div
                        style={{
                          position: "absolute",
                          right: "12px",
                          top: "50%",
                          transform: `translateY(-50%) ${showSuggestions && countrySuggestions.length > 0 ? "rotate(180deg)" : "rotate(0deg)"}`,
                          pointerEvents: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: isDarkMode ? "#9ca3af" : "#6b7280",
                          transition: "transform 0.2s",
                        }}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M7 14L12 9L17 14"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                    {/* Dropdown Menu */}
                    {showSuggestions && countrySuggestions.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: "4px",
                          backgroundColor: isDarkMode ? "#4a4a4a" : "#fafafa",
                          borderRadius: "24px",
                          border: `0.5px solid ${isDarkMode ? "#4a4a4a" : "#e5e5e5"}`,
                          zIndex: 1000,
                          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.03)",
                          width: "100%",
                          paddingTop: "8px",
                          paddingBottom: "8px",
                        }}
                      >
                        {countrySuggestions.map(({ code, name: countryName, searchTerm }) => (
                          <div
                            key={code}
                            onClick={() => handleCountrySelect(code)}
                            style={{
                              padding: "4px 16px",
                              cursor: "pointer",
                              color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                              fontSize: "0.875rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-start",
                            }}
                          >
                            <div
                              className="country-item-content"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "8px 16px",
                                borderRadius: "8px",
                                transition: "background-color 0.2s, color 0.2s",
                                width: "100%",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = isDarkMode ? "#3a2a4a" : "#efe7fd";
                                const textElement = e.currentTarget.querySelector('.country-name');
                                if (textElement) {
                                  textElement.style.color = isDarkMode ? "#a78bfa" : "#6000FF";
                                }
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                                const textElement = e.currentTarget.querySelector('.country-name');
                                if (textElement) {
                                  textElement.style.color = isDarkMode ? "#e5e7eb" : "#1e1e1e";
                                }
                              }}
                            >
                              <span style={{ fontSize: "20px", lineHeight: 1 }}>{getCountryFlag(code)}</span>
                              <span className="country-name" style={{ color: isDarkMode ? "#e5e7eb" : "#1e1e1e", transition: "color 0.2s" }}>
                                {highlightMatch(countryName, searchTerm)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Selected Countries - Positioned absolutely to not affect layout */}
                    {selectedCountries.length > 0 && !showSuggestions && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          marginTop: "12px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "10px",
                          zIndex: 1,
                        }}
                      >
                        {selectedCountries.map((code) => {
                          const country = countriesData[code];
                          return (
                            <div
                              key={code}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                padding: "8px 14px",
                                backgroundColor: isDarkMode ? "#4a4a4a" : "#e5e7eb",
                                borderRadius: "9999px",
                                fontSize: "0.875rem",
                                color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                                fontWeight: 400,
                              }}
                            >
                              <span style={{ fontSize: "18px", lineHeight: 1 }}>{getCountryFlag(code)}</span>
                              <span>{country?.country || code}</span>
                              <button
                                type="button"
                                onClick={() => handleCountryRemove(code)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: isDarkMode ? "#e5e7eb" : "#6b7280",
                                  cursor: "pointer",
                                  padding: 0,
                                  margin: 0,
                                  marginLeft: "2px",
                                  fontSize: "1.125rem",
                                  lineHeight: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "18px",
                                  height: "18px",
                                  borderRadius: "50%",
                                  transition: "background-color 0.2s, color 0.2s",
                                }}
                                onMouseEnter={(e) => {
                                  e.target.style.color = isDarkMode ? "#f87171" : "#dc2626";
                                  e.target.style.backgroundColor = isDarkMode ? "rgba(248, 113, 113, 0.1)" : "rgba(220, 38, 38, 0.1)";
                                }}
                                onMouseLeave={(e) => {
                                  e.target.style.color = isDarkMode ? "#e5e7eb" : "#6b7280";
                                  e.target.style.backgroundColor = "transparent";
                                }}
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    ref={step2ButtonRef}
                    type="button"
                    onClick={(e) => handleNextButtonClick(e, 3)}
                    disabled={selectedCountries.length === 0}
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "50%",
                      border: `0.5px solid ${selectedCountries.length > 0 ? "#6000FF" : "#9ca3af"}`,
                      backgroundColor: selectedCountries.length > 0 ? "#efe7fd" : "#f3f4f6",
                      color: selectedCountries.length > 0 ? "#6000FF" : "#9ca3af",
                      cursor: selectedCountries.length > 0 ? "pointer" : "not-allowed",
                      transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      padding: 0,
                      opacity: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCountries.length > 0) {
                        e.currentTarget.style.backgroundColor = "#efe7fd";
                        e.currentTarget.style.borderColor = "#4B00C7";
                        e.currentTarget.style.color = "#4B00C7";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCountries.length > 0) {
                        e.currentTarget.style.backgroundColor = "#efe7fd";
                        e.currentTarget.style.borderColor = "#6000FF";
                        e.currentTarget.style.color = "#6000FF";
                      }
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8.59 16.59L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.59Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
                </div>
                </div>
              </div>
            )}

            {/* Step 3: Preview & Actions - Video centered, buttons absolutely positioned to the right */}
            {currentStep === 3 && (
              <div ref={step3Ref} style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", flex: "1 1 0" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                flex: "1 1 0",
              }}>
                {/* Mobile: Show Email Form Inline */}
                {isMobile ? (
                  <div style={{
                    width: "100%",
                    maxWidth: "400px",
                    padding: "0 16px",
                  }}>
                    {/* Headlines - always visible */}
                    <h2
                      ref={step3HeadlineRef}
                      style={{
                        margin: "0 0 4px 0",
                        fontSize: "1.25rem",
                        fontWeight: 500,
                        color: isDarkMode ? "#e5e7eb" : "#0a0716",
                        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                        textAlign: "center",
                        opacity: 0,
                      }}
                    >
                      Download your Passport
                    </h2>
                    <p
                      style={{
                        margin: "0 0 24px 0",
                        fontSize: "0.8125rem",
                        color: isDarkMode ? "rgba(156, 163, 175, 0.6)" : "rgba(107, 114, 128, 0.6)",
                        fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                        textAlign: "center",
                      }}
                    >
                      We'll send the video to your email.
                    </p>
                    {!videoGenerationConfirmed ? (
                      <>
                        <div ref={step3InputRef} style={{ ...fieldContainerStyle, marginBottom: "12px", opacity: 0 }}>
                          <div style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}>
                            <div
                              className="flex-1 gradient-border-wrapper"
                              style={{
                                height: "48px",
                                minWidth: 0,
                                "--bg-color": isDarkMode ? "#333333" : "#f0f1f3",
                                "--page-bg-color": isDarkMode ? "#666666" : "#f7f8f9",
                              }}
                            >
                              <input
                                type="email"
                                id="email-mobile"
                                value={email}
                                onChange={(e) => {
                                  setEmail(e.target.value);
                                  setEmailError("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && email.trim() && validateEmail(email.trim())) {
                                    handleGenerateVideo();
                                  }
                                }}
                                placeholder="your@email.com"
                                style={{
                                  ...getInputStyle(isDarkMode, true),
                                  flex: 1,
                                  height: "100%",
                                  minWidth: 0,
                                  borderRadius: "9999px",
                                  padding: "12px 16px 12px 20px",
                                  border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                                  backgroundColor: isDarkMode ? "#333333" : "#f0f1f3",
                                  boxShadow: "none",
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.target.style, step1InputFocusStyle);
                                }}
                                onBlur={(e) => {
                                  e.target.style.borderColor = isDarkMode ? "#4a4a4a" : "#e5e7eb";
                                  e.target.style.boxShadow = "none";
                                }}
                                autoFocus
                              />
                            </div>
                            {/* Download button - circular icon, next to form */}
                            <button
                              ref={step3ButtonRef}
                              type="button"
                              onClick={handleGenerateVideo}
                              disabled={!email.trim() || !validateEmail(email.trim())}
                              aria-label="Download"
                              style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "50%",
                                border: `0.5px solid ${email.trim() && validateEmail(email.trim()) ? "#6000FF" : "#9ca3af"}`,
                                backgroundColor: email.trim() && validateEmail(email.trim()) ? "#efe7fd" : "#f3f4f6",
                                color: email.trim() && validateEmail(email.trim()) ? "#6000FF" : "#9ca3af",
                                cursor: email.trim() && validateEmail(email.trim()) ? "pointer" : "not-allowed",
                                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                                transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                                flexShrink: 0,
                                opacity: 0,
                              }}
                              onMouseEnter={(e) => {
                                if (email.trim() && validateEmail(email.trim())) {
                                  e.currentTarget.style.backgroundColor = "#efe7fd";
                                  e.currentTarget.style.borderColor = "#4B00C7";
                                  e.currentTarget.style.color = "#4B00C7";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (email.trim() && validateEmail(email.trim())) {
                                  e.currentTarget.style.backgroundColor = "#efe7fd";
                                  e.currentTarget.style.borderColor = "#6000FF";
                                  e.currentTarget.style.color = "#6000FF";
                                }
                              }}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                style={{ flexShrink: 0 }}
                              >
                                <path
                                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                          {emailError && (
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "0.75rem",
                                color: isDarkMode ? "#f87171" : "#dc2626",
                              }}
                              role="alert"
                              aria-live="polite"
                            >
                              {emailError}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Compact inline status block - center aligned on mobile */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}>
                          {/* Small status icon (16-20px) - pulsing purple circle for success, error icon for errors */}
                          {renderMessage?.type === "error" ? (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              style={{ flexShrink: 0 }}
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill={isDarkMode ? "#dc2626" : "#f87171"}
                                opacity="0.2"
                              />
                              <path
                                d="M12 8v4M12 16h.01"
                                stroke={isDarkMode ? "#f87171" : "#dc2626"}
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <div
                              ref={step3StatusCircleRef}
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "50%",
                                backgroundColor: "#efe7fd",
                                border: `1px solid #6000FF`,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {/* Status text on one line - uses same status values as visualization app */}
                          <span style={{
                            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                            fontSize: "0.875rem",
                            fontWeight: "500",
                            color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}>
                            {/* Percentage indicator - time-based */}
                            {(() => {
                              let percentage = 0;
                              // Show percentage while rendering is in progress OR when status is COMPLETED
                              if (renderStartTimeRef.current && (isRendering || renderStatus === RENDER_STATUS.COMPLETED)) {
                                // If COMPLETED status, show 100% immediately (even if before 3 minutes)
                                if (renderStatus === RENDER_STATUS.COMPLETED) {
                                  percentage = 100;
                                } else if (isRendering) {
                                  // Otherwise, calculate based on elapsed time (0-100% over 3 minutes)
                                  percentage = getTimeBasedPercentage();
                                }
                              }
                              
                              return percentage > 0 ? (
                                <span style={{
                                  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  color: isDarkMode ? "#9ca3af" : "#6b7280",
                                }}>
                                  {percentage}%
                                </span>
                              ) : null;
                            })()}
                            {/* Status text */}
                            {renderMessage?.type === "error" 
                              ? "Error" 
                              : isRendering && renderStatus
                                ? (() => {
                                    // Use same status logic as visualization app
                                    const baseText = getButtonLabel(renderStatus, isRendering);
                                    // Remove ellipsis and add animated dots for active states
                                    if (renderStatus === RENDER_STATUS.PROVISIONING || 
                                        renderStatus === RENDER_STATUS.RENDERING || 
                                        renderStatus === RENDER_STATUS.UPLOADING ||
                                        renderStatus === RENDER_STATUS.QUEUED) {
                                      const textWithoutEllipsis = baseText.replace("…", "");
                                      return textWithoutEllipsis + ".".repeat(dotCount);
                                    }
                                    return baseText;
                                  })()
                                : "Email Sent!"}
                          </span>
                        </div>
                        {/* System message + permission */}
                        {renderMessage?.type === "error" ? (
                          <p style={{
                            margin: "0 0 8px 0",
                            fontSize: "0.875rem",
                            color: isDarkMode ? "#e5e7eb" : "#6b7280",
                            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                            textAlign: "center",
                            lineHeight: "1.5",
                          }}>
                            {renderMessage.text}
                          </p>
                        ) : (
                          <>
                            {/* Recovery action - center aligned on mobile */}
                            <button
                              type="button"
                              onClick={handleChangeEmail}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: "0 auto",
                                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                                fontSize: "0.8125rem",
                                color: "#a78bfa",
                                cursor: "pointer",
                                textAlign: "center",
                                textDecoration: "none",
                                display: "block",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = "underline";
                                e.currentTarget.style.color = "#9333ea";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = "none";
                                e.currentTarget.style.color = "#a78bfa";
                              }}
                            >
                              Send to a different email
                            </button>
                          </>
                        )}
                      </>
                    )}
                    
                    {/* Only show renderMessage when NOT in post-submit state to avoid redundancy */}
                    {renderMessage && !videoGenerationConfirmed && (
                      <div
                        className="text-sm opacity-80 transition-colors duration-200 mt-4 w-full"
                        style={{
                          color: renderMessage.type === "success" 
                            ? (isDarkMode ? "#34d399" : "#059669")
                            : (isDarkMode ? "#f87171" : "#dc2626"),
                          fontSize: "0.875rem",
                          textAlign: "center",
                        }}
                      >
                        {renderMessage.text}
                      </div>
                    )}
                  </div>
                ) : (
                /* Desktop/Tablet (md+): Split layout - email form left, video preview right */
                <div style={{
                  display: windowWidth > 768 ? "grid" : "flex",
                  gridTemplateColumns: windowWidth > 768 ? "1fr auto 1fr" : "none",
                  flexDirection: windowWidth > 768 ? "row" : "column",
                  gap: windowWidth > 768 ? "16px" : "16px",
                  alignItems: windowWidth > 768 ? "center" : "center",
                  alignContent: windowWidth > 768 ? "center" : "center",
                  width: "100%",
                  maxWidth: windowWidth > 768 ? "1200px" : "100%",
                  margin: "0 auto",
                }}>
                  {/* Left Column: Download Panel (md+ only) */}
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    maxWidth: "390px",
                    width: "100%",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <h2
                        ref={step3HeadlineRef}
                        style={{
                          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                          fontWeight: 500,
                          fontSize: windowWidth > 768 ? "1.25rem" : "1.125rem",
                          color: isDarkMode ? "#e5e7eb" : "#0a0716",
                          margin: 0,
                          textAlign: "left",
                          opacity: 0,
                        }}
                      >
                        Download your Passport
                      </h2>
                      <p
                        style={{
                          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                          fontSize: "0.8125rem",
                          color: isDarkMode ? "rgba(156, 163, 175, 0.6)" : "rgba(107, 114, 128, 0.6)",
                          margin: 0,
                          marginBottom: "24px",
                          textAlign: "left",
                        }}
                      >
                        We'll send the video to your email.
                        {videoGenerationConfirmed && (
                          <span style={{
                            fontSize: "0.75rem",
                            color: isDarkMode ? "rgba(156, 163, 175, 0.6)" : "rgba(107, 114, 128, 0.6)",
                          }}>
                            {" "}You can close this tab.
                          </span>
                        )}
                      </p>
                    </div>
                    
                    {/* Email form - moved inline from modal for md+ */}
                    {!videoGenerationConfirmed ? (
                      <>
                        <div ref={step3InputRef} style={{ ...fieldContainerStyle, marginBottom: "12px", opacity: 0 }}>
                          <div style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                          }}>
                            <div
                              className="flex-1 gradient-border-wrapper"
                              style={{
                                height: "48px",
                                minWidth: 0,
                                "--bg-color": isDarkMode ? "#333333" : "#f0f1f3",
                                "--page-bg-color": isDarkMode ? "#666666" : "#f7f8f9",
                              }}
                            >
                              <input
                                type="email"
                                id="email-desktop"
                                value={email}
                                onChange={(e) => {
                                  setEmail(e.target.value);
                                  setEmailError("");
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && email.trim() && validateEmail(email.trim())) {
                                    handleGenerateVideo();
                                  }
                                }}
                                placeholder="your@email.com"
                                style={{
                                  ...getInputStyle(isDarkMode, false),
                                  flex: 1,
                                  height: "100%",
                                  minWidth: 0,
                                  borderRadius: "9999px",
                                  padding: "12px 16px 12px 20px",
                                  border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                                  backgroundColor: isDarkMode ? "#333333" : "#f0f1f3",
                                  boxShadow: "none",
                                  fontSize: "0.9375rem",
                                }}
                                onFocus={(e) => {
                                  Object.assign(e.target.style, step1InputFocusStyle);
                                }}
                                onBlur={(e) => {
                                  e.target.style.borderColor = isDarkMode ? "#4a4a4a" : "#e5e7eb";
                                  e.target.style.boxShadow = "none";
                                }}
                                autoFocus
                              />
                            </div>
                            {/* Download button - circular icon, next to form */}
                            <button
                              ref={step3ButtonRef}
                              type="button"
                              onClick={handleGenerateVideo}
                              disabled={!email.trim() || !validateEmail(email.trim())}
                              aria-label="Download"
                              style={{
                                width: "48px",
                                height: "48px",
                                borderRadius: "50%",
                                border: `0.5px solid ${email.trim() && validateEmail(email.trim()) ? "#6000FF" : "#9ca3af"}`,
                                backgroundColor: email.trim() && validateEmail(email.trim()) ? "#efe7fd" : "#f3f4f6",
                                color: email.trim() && validateEmail(email.trim()) ? "#6000FF" : "#9ca3af",
                                cursor: email.trim() && validateEmail(email.trim()) ? "pointer" : "not-allowed",
                                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                                transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                                flexShrink: 0,
                                opacity: 0,
                              }}
                              onMouseEnter={(e) => {
                                if (email.trim() && validateEmail(email.trim())) {
                                  e.currentTarget.style.backgroundColor = "#efe7fd";
                                  e.currentTarget.style.borderColor = "#4B00C7";
                                  e.currentTarget.style.color = "#4B00C7";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (email.trim() && validateEmail(email.trim())) {
                                  e.currentTarget.style.backgroundColor = "#efe7fd";
                                  e.currentTarget.style.borderColor = "#6000FF";
                                  e.currentTarget.style.color = "#6000FF";
                                }
                              }}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                style={{ flexShrink: 0 }}
                              >
                                <path
                                  d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                          {emailError && (
                            <div
                              style={{
                                marginTop: "4px",
                                fontSize: "0.75rem",
                                color: isDarkMode ? "#f87171" : "#dc2626",
                              }}
                              role="alert"
                              aria-live="polite"
                            >
                              {emailError}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Compact inline status block - replaces large success screen */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "8px",
                        }}>
                          {/* Small status icon (16-20px) - pulsing purple circle for success, error icon for errors */}
                          {renderMessage?.type === "error" ? (
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              style={{ flexShrink: 0 }}
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="10"
                                fill={isDarkMode ? "#dc2626" : "#f87171"}
                                opacity="0.2"
                              />
                              <path
                                d="M12 8v4M12 16h.01"
                                stroke={isDarkMode ? "#f87171" : "#dc2626"}
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <div
                              ref={step3StatusCircleRef}
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "50%",
                                backgroundColor: "#efe7fd",
                                border: `1px solid #6000FF`,
                                flexShrink: 0,
                              }}
                            />
                          )}
                          {/* Status text on one line - uses same status values as visualization app */}
                          <span style={{
                            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                            fontSize: "0.875rem",
                            fontWeight: "500",
                            color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}>
                            {/* Percentage indicator - time-based */}
                            {(() => {
                              let percentage = 0;
                              // Show percentage while rendering is in progress OR when status is COMPLETED
                              if (renderStartTimeRef.current && (isRendering || renderStatus === RENDER_STATUS.COMPLETED)) {
                                // If COMPLETED status, show 100% immediately (even if before 3 minutes)
                                if (renderStatus === RENDER_STATUS.COMPLETED) {
                                  percentage = 100;
                                } else if (isRendering) {
                                  // Otherwise, calculate based on elapsed time (0-100% over 3 minutes)
                                  percentage = getTimeBasedPercentage();
                                }
                              }
                              
                              return percentage > 0 ? (
                                <span style={{
                                  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  color: isDarkMode ? "#9ca3af" : "#6b7280",
                                }}>
                                  {percentage}%
                                </span>
                              ) : null;
                            })()}
                            {/* Status text */}
                            {renderMessage?.type === "error" 
                              ? "Error" 
                              : isRendering && renderStatus
                                ? (() => {
                                    // Use same status logic as visualization app
                                    const baseText = getButtonLabel(renderStatus, isRendering);
                                    // Remove ellipsis and add animated dots for active states
                                    if (renderStatus === RENDER_STATUS.PROVISIONING || 
                                        renderStatus === RENDER_STATUS.RENDERING || 
                                        renderStatus === RENDER_STATUS.UPLOADING ||
                                        renderStatus === RENDER_STATUS.QUEUED) {
                                      const textWithoutEllipsis = baseText.replace("…", "");
                                      return textWithoutEllipsis + ".".repeat(dotCount);
                                    }
                                    return baseText;
                                  })()
                                : "Email Sent!"}
                          </span>
                        </div>
                        {/* System message + permission (md+ only) */}
                        {renderMessage?.type === "error" ? (
                          <p style={{
                            margin: "0 0 8px 0",
                            fontSize: "0.875rem",
                            color: isDarkMode ? "#e5e7eb" : "#6b7280",
                            fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                            textAlign: "left",
                            lineHeight: "1.5",
                          }}>
                            {renderMessage.text}
                          </p>
                        ) : (
                          <>
                            {/* Recovery action */}
                            <button
                              type="button"
                              onClick={handleChangeEmail}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                                fontSize: "0.8125rem",
                                color: "#a78bfa",
                                cursor: "pointer",
                                textAlign: "left",
                                textDecoration: "none",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.textDecoration = "underline";
                                e.currentTarget.style.color = "#9333ea";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.textDecoration = "none";
                                e.currentTarget.style.color = "#a78bfa";
                              }}
                            >
                              Send to a different email
                            </button>
                          </>
                        )}
                      </>
                    )}
                    
                    {/* Only show renderMessage when NOT in post-submit state to avoid redundancy */}
                    {renderMessage && !videoGenerationConfirmed && (
                      <div
                        className="text-sm opacity-80 transition-colors duration-200 mt-4 w-full"
                        style={{
                          color: renderMessage.type === "success" 
                            ? (isDarkMode ? "#34d399" : "#059669")
                            : (isDarkMode ? "#f87171" : "#dc2626"),
                          fontSize: "0.875rem",
                          textAlign: "left",
                        }}
                      >
                        {renderMessage.text}
                      </div>
                    )}
                  </div>
                  
                  {/* Divider between columns (md+ only) */}
                  {windowWidth > 768 && (
                    <div
                      style={{
                        width: "1px",
                        backgroundColor: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                        alignSelf: "stretch",
                      }}
                    />
                  )}
                  
                  {/* Right Column: Video Preview (md+ only) */}
                  <div
                    className="relative flex-shrink-0"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      alignSelf: "center",
                      position: "relative",
                      gap: "8px",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}>
                      <div
                        style={{
                          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                          fontSize: "0.75rem",
                          fontWeight: 400,
                          color: isDarkMode ? "rgba(156, 163, 175, 0.8)" : "rgba(107, 114, 128, 0.8)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "4px 12px",
                          borderRadius: "9999px",
                          backgroundColor: isDarkMode ? "rgba(58, 58, 58, 0.5)" : "rgba(229, 231, 235, 0.6)",
                          border: `1px solid ${isDarkMode ? "rgba(75, 85, 99, 0.3)" : "rgba(209, 213, 219, 0.4)"}`,
                        }}
                      >
                        {name}'s PASSPORT PREVIEW
                      </div>
                      {/* Share button - icon only, next to preview pill */}
                      <button
                        ref={step3ShareButtonRef}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleShareToStory();
                        }}
                        disabled={!isInitialized || !name.trim()}
                        aria-label="Share Story"
                        style={{
                          width: "28px",
                          height: "28px",
                          padding: 0,
                          borderRadius: "50%",
                          border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                          backgroundColor: "transparent",
                          color: (!isInitialized || !name.trim())
                            ? (isDarkMode ? "#6b7280" : "#9ca3af")
                            : (isDarkMode ? "#9ca3af" : "#6b7280"),
                          cursor: (!isInitialized || !name.trim()) ? "not-allowed" : "pointer",
                          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                          transition: "background-color 0.2s, border-color 0.2s, color 0.2s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          opacity: 0,
                        }}
                        onMouseEnter={(e) => {
                          if (isInitialized && name.trim()) {
                            e.currentTarget.style.backgroundColor = isDarkMode ? "#4a4a4a" : "#f3f4f6";
                            e.currentTarget.style.borderColor = isDarkMode ? "#5a5a5a" : "#9ca3af";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isInitialized && name.trim()) {
                            e.currentTarget.style.backgroundColor = "transparent";
                            e.currentTarget.style.borderColor = isDarkMode ? "#4a4a4a" : "#e5e7eb";
                          }
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ flexShrink: 0 }}
                        >
                          <path
                            d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <div
                      ref={videoContainerRef}
                      onClick={handlePlayerClick}
                      className="video-wrapper overflow-hidden rounded-lg flex-shrink-0"
                      style={{
                        height: "calc(100vh - 200px)",
                        maxHeight: "600px",
                        width: "calc((100vh - 200px) * 0.5625)",
                        maxWidth: "338.5px",
                        border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                        borderRadius: "12px",
                        transition: "border-color 0.2s",
                        lineHeight: 0,
                        fontSize: 0,
                        cursor: "pointer",
                      }}
                    >
                      {fontLoaded ? (
                        <Player
                          ref={playerRef}
                          component={PassportComposition}
                          durationInFrames={PASSPORT_COMPOSITION_CONFIG.durationInFrames}
                          fps={PASSPORT_COMPOSITION_CONFIG.fps}
                          compositionWidth={PASSPORT_COMPOSITION_CONFIG.width}
                          compositionHeight={PASSPORT_COMPOSITION_CONFIG.height}
                          controls={false}
                          loop={true}
                          style={{ 
                            width: "100%", 
                            height: "100%",
                            display: "block",
                            margin: 0,
                            padding: 0,
                            borderRadius: "12px",
                            objectFit: "cover"
                          }}
                          inputProps={{ 
                            name,
                            selectedCountries,
                            animationVariant,
                            archetype,
                            intent,
                            countryCount,
                            continentCount,
                          }}
                          acknowledgeRemotionLicense
                        />
                      ) : (
                        <div
                          className="w-full h-full bg-black block m-0 p-0 rounded-lg"
                        />
                      )}
                      {/* Play Button Overlay - Only visible when paused */}
                      {!isPlaying && (
                        <>
                          {/* Blur effect behind play button */}
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%)",
                              zIndex: 9,
                              width: "64px",
                              height: "64px",
                              borderRadius: "50%",
                              backdropFilter: "blur(8px)",
                              WebkitBackdropFilter: "blur(8px)",
                              backgroundColor: "rgba(0, 0, 0, 0.2)",
                            }}
                          />
                          <button
                            onClick={handlePlayPause}
                            className="rounded-full transition-all duration-200 flex-shrink-0"
                            style={{
                              position: "absolute",
                              top: "50%",
                              left: "50%",
                              transform: "translate(-50%, -50%)",
                              zIndex: 10,
                              width: "64px",
                              height: "64px",
                              borderRadius: "50%",
                              backgroundColor: "rgba(0, 0, 0, 0.6)",
                              color: "#ffffff",
                              margin: 0,
                              padding: 0,
                              border: "none",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
                          e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
                          e.currentTarget.style.transform = "translate(-50%, -50%)";
                        }}
                        onMouseDown={(e) => {
                          e.currentTarget.style.transform = "translate(-50%, -50%) scale(0.95)";
                        }}
                        onMouseUp={(e) => {
                          e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.05)";
                        }}
                        aria-label="Play"
                      >
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          preserveAspectRatio="xMidYMid meet"
                          style={{
                            display: "block",
                            flexShrink: 0,
                            margin: 0,
                            padding: 0,
                            width: "32px",
                            height: "32px",
                          }}
                        >
                          <path
                            d="M8 5v14l11-7z"
                            fill="currentColor"
                          />
                        </svg>
                        </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && videoGenerationConfirmed) {
              setShowEmailModal(false);
              setEmailError("");
              setVideoGenerationConfirmed(false);
            }
          }}
        >
          <div
            style={{
              backgroundColor: isDarkMode ? "#2a2a2a" : "#ffffff",
              borderRadius: "24px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
              boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!videoGenerationConfirmed ? (
              <>
                <h2
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                  }}
                >
                  Generate Video
                </h2>
                <p
                  style={{
                    margin: "0 0 20px 0",
                    fontSize: "0.875rem",
                    color: isDarkMode ? "#e5e7eb" : "#6b7280",
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                  }}
                >
                  We'll email your video to you when it's ready.
                </p>
                <div style={{ ...fieldContainerStyle, marginBottom: "20px" }}>
                  <label htmlFor="email" style={getLabelStyle(isDarkMode)}>
                    Email Address
                  </label>
                  <div
                    className="flex-1 gradient-border-wrapper"
                    style={{
                      height: "44px",
                      minWidth: 0,
                      "--bg-color": isDarkMode ? "#333333" : "#f0f1f3",
                      "--page-bg-color": isDarkMode ? "#666666" : "#f7f8f9",
                    }}
                  >
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && email.trim() && validateEmail(email.trim())) {
                          handleGenerateVideo();
                        }
                      }}
                      placeholder="your@email.com"
                      style={{
                        ...getInputStyle(isDarkMode, windowWidth <= 768),
                        flex: 1,
                        height: "100%",
                        minWidth: 0,
                        borderRadius: "9999px",
                        padding: "10px 12px 10px 16px",
                        border: "none",
                        boxShadow: "none",
                      }}
                      onFocus={(e) => {
                        Object.assign(e.target.style, step1InputFocusStyle);
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "transparent";
                        e.target.style.boxShadow = "none";
                      }}
                      autoFocus
                    />
                  </div>
                  {emailError && (
                    <div
                      style={{
                        marginTop: "4px",
                        fontSize: "0.75rem",
                        color: isDarkMode ? "#f87171" : "#dc2626",
                      }}
                    >
                      {emailError}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailModal(false);
                      setEmailError("");
                      setVideoGenerationConfirmed(false);
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "9999px",
                      border: `1px solid ${isDarkMode ? "#4a4a4a" : "#e5e7eb"}`,
                      backgroundColor: "transparent",
                      color: isDarkMode ? "#e5e7eb" : "#4b5563",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                      cursor: "pointer",
                      fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                      transition: "background-color 0.2s, border-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? "#4a4a4a" : "#f3f4f6";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateVideo}
                    disabled={!email.trim() || !validateEmail(email.trim())}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "9999px",
                      border: "none",
                      backgroundColor: email.trim() && validateEmail(email.trim()) ? "#6000FF" : "#9ca3af",
                      color: "#ffffff",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                      cursor: email.trim() && validateEmail(email.trim()) ? "pointer" : "not-allowed",
                      fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (email.trim() && validateEmail(email.trim())) {
                        e.currentTarget.style.backgroundColor = "#4B00C7";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (email.trim() && validateEmail(email.trim())) {
                        e.currentTarget.style.backgroundColor = "#6000FF";
                      }
                    }}
                  >
                    Generate Video
                  </button>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "50%",
                      backgroundColor: isDarkMode ? "#1a4d2e" : "#d1fae5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M20 6L9 17l-5-5"
                        stroke={isDarkMode ? "#34d399" : "#059669"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <h2
                  style={{
                    margin: "0 0 16px 0",
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: isDarkMode ? "#e5e7eb" : "#1e1e1e",
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    textAlign: "center",
                  }}
                >
                  Video Generation Started!
                </h2>
                <p
                  style={{
                    margin: "0 0 20px 0",
                    fontSize: "0.875rem",
                    color: isDarkMode ? "#e5e7eb" : "#6b7280",
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    textAlign: "center",
                    lineHeight: "1.6",
                  }}
                >
                  Your video will be sent to <strong style={{ color: isDarkMode ? "#e5e7eb" : "#1e1e1e" }}>{email}</strong> as soon as it's ready.
                </p>
                <p
                  style={{
                    margin: "0 0 24px 0",
                    fontSize: "0.875rem",
                    color: isDarkMode ? "#9ca3af" : "#6b7280",
                    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                    textAlign: "center",
                    fontStyle: "italic",
                  }}
                >
                  It's safe to close this window now.
                </p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailModal(false);
                      setEmailError("");
                      setVideoGenerationConfirmed(false);
                    }}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "#6000FF",
                      color: "#ffffff",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                      cursor: "pointer",
                      fontFamily: "'IBM Plex Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Avenir, Helvetica, Arial, sans-serif",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#4B00C7";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#6000FF";
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
