import React, { useState } from 'react';
import DiscoverView from './components/DiscoverView';
import ConversationView from './components/ConversationView';
import { CompassIcon, MicIcon } from './components/common/Icons';

type View = 'discover' | 'converse';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<View>('discover');

  const navButtonClasses = (view: View) => 
    `flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 ${
      activeView === view
        ? 'bg-orange-600 text-white shadow-md'
        : 'bg-white text-gray-700 hover:bg-gray-200'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-100 text-gray-800">
      <div className="container mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight font-serif">
            Geo-Narrator
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Your Personal AI Tour Guide
          </p>
        </header>

        <nav className="flex justify-center items-center p-2 bg-gray-200/50 rounded-full shadow-inner mb-8 sticky top-4 z-10 backdrop-blur-sm">
          <button
            onClick={() => setActiveView('discover')}
            className={navButtonClasses('discover')}
          >
            <CompassIcon />
            Discover Place
          </button>
          <button
            onClick={() => setActiveView('converse')}
            className={navButtonClasses('converse')}
          >
            <MicIcon />
            Converse with AI
          </button>
        </nav>

        <main>
          {activeView === 'discover' && <DiscoverView />}
          {activeView === 'converse' && <ConversationView />}
        </main>
        
        <footer className="text-center mt-12 text-sm text-gray-500">
          <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;