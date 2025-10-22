import React, { useState, useCallback, useRef, useEffect } from 'react';
import { getNearbyPlaces, getTextToSpeech } from '../services/geminiService';
import { PlaceInfo, GroundingSource } from '../types';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { CompassIcon, LoaderIcon, PlayIcon, PauseIcon, WebIcon, MapPinIcon, ArrowLeftIcon, SearchIcon, ImageIcon } from './common/Icons';

const getCategoryImage = (category?: string): string => {
  const defaultCategory = 'other';
  const categoryLower = category?.toLowerCase() || defaultCategory;

  const categories: Record<string, string> = {
    nature: 'https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    architecture: 'https://images.pexels.com/photos/161439/architecture-building-france-landmark-161439.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    history: 'https://images.pexels.com/photos/326900/pexels-photo-326900.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    food: 'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    art: 'https://images.pexels.com/photos/102127/pexels-photo-102127.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
    other: 'https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
  };

  for (const key in categories) {
    if (categoryLower.includes(key)) {
      return categories[key];
    }
  }

  return categories.other; // Generic fallback
};


const DiscoverView: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceInfo[] | null>(null);
  const [sources, setSources] = useState<GroundingSource[] | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceInfo | null>(null);
  const [locationInput, setLocationInput] = useState('');
  
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLanguage, setAudioLanguage] = useState<'english' | 'hindi'>('english');

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    audioBufferRef.current = null;
    setIsPlaying(false);
  }, []);
  
  const handleFetchPlaces = useCallback(async (locationQuery: string) => {
    setIsLoading(true);
    setError(null);
    setPlaces(null);
    setSelectedPlace(null);
    setSources(null);
    cleanupAudio();

    try {
      setStatus('Finding interesting places...');
      const { places: foundPlaces, sources: foundSources } = await getNearbyPlaces(locationQuery);
      setSources(foundSources);

      setStatus('Preparing place cards...');
      const placesWithImages = foundPlaces.map(place => ({
        ...place,
        imageUrl: getCategoryImage(place.category),
      }));

      setPlaces(placesWithImages);
      setStatus('Done!');

    } catch (err) {
      console.error(err);
      setError((err as Error).message || 'Failed to get information. Please try again.');
    } finally {
      setIsLoading(false);
      setStatus('');
    }
  }, [cleanupAudio]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (locationInput.trim()) {
      handleFetchPlaces(locationInput.trim());
    }
  };

  const handleUseCurrentLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setStatus('Getting your location...');
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      const { latitude, longitude } = position.coords;
      await handleFetchPlaces(`near my current location at latitude ${latitude}, longitude ${longitude}`);
    } catch (err) {
      console.error(err);
      if (err instanceof GeolocationPositionError) {
        setError(`Geolocation Error: ${err.message}`);
      } else {
        setError((err as Error).message || 'Failed to get location. Please try again.');
      }
      setIsLoading(false);
      setStatus('');
    }
  }, [handleFetchPlaces]);


  const handleSelectPlace = useCallback((place: PlaceInfo) => {
    setSelectedPlace(place);
  }, []);

  useEffect(() => {
    if (!selectedPlace) {
      return;
    }

    const generateAudio = async () => {
      cleanupAudio();
      setIsAudioLoading(true);
      try {
        const audioBase64 = await getTextToSpeech(selectedPlace.description, audioLanguage);
        if (!audioContextRef.current) {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        const audioBytes = decode(audioBase64);
        const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
        audioBufferRef.current = audioBuffer;
      } catch (err) {
        console.error("Failed to generate audio", err);
      } finally {
        setIsAudioLoading(false);
      }
    };

    generateAudio();
  }, [selectedPlace, audioLanguage, cleanupAudio]);

  const toggleAudio = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return;

    if (isPlaying) {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }
    } else {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        setIsPlaying(false);
        audioSourceRef.current = null;
      };
      source.start();
      audioSourceRef.current = source;
      setIsPlaying(true);
    }
  };
  
  const renderInitialState = () => (
    <div className="text-center p-8 bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-lg">
        <h2 className="text-3xl font-serif font-bold mb-4">Where do you want to explore?</h2>
        <p className="text-gray-600 mb-6">
            Enter a city, landmark, or address to find hidden gems.
        </p>
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2 mb-4">
            <input 
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              placeholder="e.g., 'Eiffel Tower' or 'Kyoto, Japan'"
              className="flex-grow px-4 py-3 bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-full focus:ring-2 focus:ring-orange-500 focus:outline-none transition-shadow"
            />
            <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white font-bold rounded-full shadow-lg hover:bg-orange-700 active:scale-95 transform transition-all duration-150"
            >
                <SearchIcon />
                Search
            </button>
        </form>
        <div className="relative flex items-center my-6">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
        </div>
        <button
            onClick={handleUseCurrentLocation}
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-gray-700 text-white font-bold rounded-full shadow-lg hover:bg-gray-800 active:scale-95 transform transition-all duration-150"
        >
            <CompassIcon />
            Use My Current Location
        </button>
    </div>
  );
  
  const renderPlacesList = () => (
    <div className="w-full animate-fade-in">
        <h2 className="text-3xl font-serif font-bold mb-6 text-center">Nearby Hidden Gems</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {places?.map(place => (
                <div key={place.name} onClick={() => handleSelectPlace(place)} className="bg-white rounded-xl shadow-md border border-gray-200 cursor-pointer transform hover:scale-105 hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
                    <img src={place.imageUrl} alt={place.name} className="w-full h-40 object-cover" />
                    <div className="p-4 flex flex-col flex-grow">
                      <h3 className="text-xl font-serif font-bold mb-2 text-gray-900">{place.name}</h3>
                      <p className="text-gray-600 flex-grow">{place.oneLiner}</p>
                    </div>
                </div>
            ))}
        </div>
         <div className="text-center mt-8">
            <button onClick={() => setPlaces(null)} className="text-orange-600 font-semibold hover:underline">
                Start a New Search
            </button>
        </div>
    </div>
  );

  const renderSelectedPlace = () => (
     <div className="w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200 animate-fade-in">
        {selectedPlace?.imageUrl && (
            <img src={selectedPlace.imageUrl} alt={selectedPlace.name} className="w-full h-48 sm:h-64 object-cover" />
        )}
        <div className="p-6 sm:p-8">
            <button onClick={() => setSelectedPlace(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 mb-6 hover:underline">
                <ArrowLeftIcon />
                Back to List
            </button>
            <h2 className="text-4xl font-serif font-bold mb-4">{selectedPlace?.name}</h2>
            
            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Audio Guide Language</label>
                <div className="inline-flex rounded-md shadow-sm" role="group">
                    <button
                        type="button"
                        onClick={() => setAudioLanguage('english')}
                        className={`px-4 py-2 text-sm font-medium border rounded-l-lg transition-colors duration-150 ${
                            audioLanguage === 'english'
                                ? 'bg-orange-600 text-white border-orange-600 z-10'
                                : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        Indian English
                    </button>
                    <button
                        type="button"
                        onClick={() => setAudioLanguage('hindi')}
                        className={`px-4 py-2 text-sm font-medium border-t border-b border-r rounded-r-md transition-colors duration-150 ${
                            audioLanguage === 'hindi'
                                ? 'bg-orange-600 text-white border-orange-600 z-10'
                                : 'bg-white text-gray-900 border-gray-200 hover:bg-gray-100'
                        }`}
                    >
                        Hindi
                    </button>
                </div>
            </div>

            <div className="mb-6 flex items-center gap-4 min-h-[48px]">
                {isAudioLoading ? (
                    <div className="flex items-center gap-2">
                        <LoaderIcon />
                        <span className="text-gray-600">Generating audio guide...</span>
                    </div>
                ) : audioBufferRef.current ? (
                    <>
                        <button onClick={toggleAudio} className="p-3 bg-orange-600 text-white rounded-full hover:bg-orange-700 transition-colors shadow-md disabled:bg-gray-400">
                        {isPlaying ? <PauseIcon /> : <PlayIcon />}
                        </button>
                        <p className="font-medium text-gray-700">{isPlaying ? "Playing Audio Guide..." : "Listen to the Audio Guide"}</p>
                    </>
                ) : <p className="text-gray-500">Audio guide could not be generated.</p>}
            </div>
            
            <div className="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                {selectedPlace?.description}
            </div>

            {sources && sources.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold border-b pb-2 mb-4">Sources</h3>
                <ul className="space-y-2">
                  {sources.map((source, index) => (
                    <li key={index} className="flex items-start gap-3">
                       {source.type === 'web' ? <WebIcon /> : <MapPinIcon />}
                       <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline break-all">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      {isLoading ? (
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-lg">
          <LoaderIcon />
          <p className="text-lg font-medium text-orange-600 animate-pulse">{status}</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <p>{error}</p>
          <button onClick={() => { setError(null); setPlaces(null); }} className="mt-2 text-sm font-bold text-red-800 underline">
              Try Again
          </button>
        </div>
      ) : selectedPlace ? (
        renderSelectedPlace()
      ) : places ? (
        renderPlacesList()
      ) : (
        renderInitialState()
      )}
    </div>
  );
};

export default DiscoverView;