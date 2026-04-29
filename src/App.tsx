/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, 
  Rocket, 
  Lightbulb, 
  Zap, 
  TrendingUp, 
  Award, 
  ChevronRight, 
  CheckCircle2, 
  ArrowLeft,
  Loader2,
  Trophy,
  Star,
  Target,
  Mic,
  MicOff,
  Volume2,
  Video,
  VideoOff,
  Camera,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  serverTimestamp,
  onSnapshot,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { SCENARIOS, XP_PER_LEVEL, getRankFromLevel } from './constants';
import { Scenario, UserStats, Evaluation, Difficulty, PracticeSession } from './types';
import { evaluateResponse } from './services/geminiService';

// --- Components ---

const ProgressBar = ({ progress, label }: { progress: number, label?: string }) => (
  <div className="w-full">
    {label && <div className="flex justify-between mb-1 text-xs font-mono uppercase tracking-widest font-black opacity-40">
      <span>{label}</span>
      <span>{Math.round(progress)}%</span>
    </div>}
    <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
      <motion.div 
        className="h-full bg-brand-green rounded-full shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
    </div>
  </div>
);

const ScoreRing = ({ score, label, colorClass }: { score: number, label: string, colorClass: string }) => (
  <div className="flex flex-col items-center bg-white rounded-3xl border-b-4 border-slate-200 p-4 transition-transform hover:-translate-y-1">
    <span className={`text-2xl font-black ${colorClass}`}>{Math.round(score * 10)}%</span>
    <span className="text-[10px] font-black text-[#AFAFAF] uppercase tracking-wider mt-1 text-center leading-tight">{label}</span>
  </div>
);

// --- Main App Logic ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [stats, setStats] = useState<UserStats>({
    xp: 0,
    level: 1,
    rank: Difficulty.BEGINNER,
    completedScenarios: []
  });

  const [currentScenario, setCurrentScenario] = useState<Scenario | null>(null);
  const [response, setResponse] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'audio' | 'video'>('audio');
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data() as UserStats);
      } else {
        // Initialize user if doesn't exist
        setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          xp: 0,
          level: 1,
          rank: Difficulty.BEGINNER,
          completedScenarios: []
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }

    const sessionsRef = collection(db, 'sessions');
    const q = query(
      sessionsRef, 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userSessions = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as PracticeSession));
      setSessions(userSessions);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'sessions');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    localStorage.setItem('comm-coach-stats', JSON.stringify(stats));
  }, [stats]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, 
        audio: true 
      });
      setVideoStream(stream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
      setPracticeMode('audio');
      return null;
    }
  };

  const stopCamera = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  const toggleRecording = async () => {
    if (!isRecording) {
      let currentStream = videoStream;
      if (practiceMode === 'video' && !videoStream) {
        currentStream = await startCamera();
      }

      setIsRecording(true);
      setRecordedVideoUrl(null);
      recordedChunksRef.current = [];

      if (practiceMode === 'video' && currentStream) {
        const recorder = new MediaRecorder(currentStream);
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setRecordedVideoUrl(url);
        };

        recorder.start();
      }

      if (!response) {
        setResponse(practiceMode === 'video' 
          ? " (Simulated video transcript: The user is presenting their pitch with active hand gestures. They maintain strong eye contact with the camera and speak with varying intonation...) "
          : " (Simulated transcript: The user began explaining their perspective on the importance of clear communication in high-stakes environments...) "
        );
      }
    } else {
      setIsRecording(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (practiceMode === 'video') {
         // Optionally keep camera running for preview or stop it. Let's stop it for now.
         stopCamera();
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartScenario = (scenario: Scenario) => {
    setCurrentScenario(scenario);
    setResponse('');
    setEvaluation(null);
    setRecordedVideoUrl(null);
    setPracticeMode('audio');
  };

  const handleSubmit = async () => {
    if (!currentScenario || !response.trim() || !user) return;

    setIsEvaluating(true);
    try {
      const result = await evaluateResponse(currentScenario, response, stats.rank, practiceMode);
      setEvaluation(result);
      
      const newXp = stats.xp + currentScenario.xpReward;
      const newLevel = Math.floor(newXp / XP_PER_LEVEL) + 1;
      const rank = getRankFromLevel(newLevel);
      
      if (newLevel > stats.level) {
        setShowLevelUp(true);
      }

      // Update Firestore stats
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        ...stats,
        xp: newXp,
        level: newLevel,
        rank: rank,
        completedScenarios: stats.completedScenarios.includes(currentScenario.id) 
          ? stats.completedScenarios 
          : [...stats.completedScenarios, currentScenario.id]
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));

      // Save session
      await addDoc(collection(db, 'sessions'), {
        userId: user.uid,
        scenarioId: currentScenario.id,
        type: practiceMode,
        transcript: response,
        evaluation: result,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'sessions'));

    } catch (error) {
      console.error(error);
      alert("Failed to evaluate. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const getIcon = (iconName: string) => {
    const icons: Record<string, any> = { User: UserIcon, Rocket, Lightbulb, Zap, TrendingUp };
    const IconComp = icons[iconName] || Target;
    return <IconComp className="w-5 h-5" />;
  };

  const canAccess = (scenario: Scenario) => {
    if (scenario.difficulty === Difficulty.BEGINNER) return true;
    if (scenario.difficulty === Difficulty.INTERMEDIATE) return stats.level >= 3;
    if (scenario.difficulty === Difficulty.ADVANCED) return stats.level >= 6;
    return false;
  };

  // --- Render Routes ---

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-[40px] p-10 max-w-sm w-full shadow-sm border-b-8 border-slate-200">
           <div className="w-20 h-20 bg-brand-green rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_6px_0_0_#46A302]">
             <Zap className="w-10 h-10 text-white" />
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tight mb-4 text-[#3C3C3C]">Communi-Go</h1>
           <p className="text-slate-400 font-bold mb-10 leading-relaxed">Master the art of conversation through gamified practice.</p>
           <button 
             onClick={() => signInWithGoogle()}
             className="chunky-button-blue w-full flex items-center justify-center gap-3"
           >
             Get Started
           </button>
        </div>
      </div>
    );
  }

  if (isEvaluating) {
    return (
      <div className="min-h-screen bg-[#F0F4F8] flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="mb-8 p-6 bg-brand-green rounded-3xl text-white shadow-[0_6px_0_0_#46A302]"
        >
          <Zap className="w-10 h-10" />
        </motion.div>
        <h2 className="text-3xl font-black uppercase tracking-tight mb-2 text-brand-green">Evaluating...</h2>
        <p className="text-slate-500 font-bold max-w-xs mx-auto">
          Our AI coach is breaking down your response based on clarity, structure, and persuasiveness.
        </p>
      </div>
    );
  }

  if (evaluation && currentScenario) {
    return (
      <div className="min-h-screen bg-[#F0F4F8]">
        <div className="max-w-2xl mx-auto p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[40px] p-8 shadow-sm border-b-8 border-slate-200"
          >
            <div className="flex justify-between items-start mb-10 border-b-2 border-slate-100 pb-8">
              <div>
                <h2 className="text-3xl font-black mb-1 uppercase tracking-tight text-[#3C3C3C]">Vocal Performance</h2>
                <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">{currentScenario.title}</p>
              </div>
              <div className="text-right">
                <div className="text-5xl font-black text-brand-green drop-shadow-sm">{evaluation.totalScore}</div>
                <div className="text-[10px] font-black uppercase text-slate-400">Fluency Score</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
              <ScoreRing score={evaluation.scores.cadence} label="Cadence" colorClass="text-brand-blue" />
              <ScoreRing score={evaluation.scores.language} label="Lexic" colorClass="text-brand-orange" />
              <ScoreRing score={evaluation.scores.shockFactor} label="Impact" colorClass="text-brand-green" />
              <ScoreRing score={evaluation.scores.efficiency} label="Efficiency" colorClass="text-brand-red" />
              {practiceMode === 'video' && (
                <ScoreRing score={evaluation.scores.bodyLanguage || 0} label="Body Lang." colorClass="text-brand-purple" />
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-8">
                <section className="bg-brand-green rounded-[32px] p-6 text-white shadow-[0_6px_0_0_#46A302]">
                  <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest mb-4 border-b border-white/20 pb-2">
                    <Volume2 className="w-5 h-5" />
                    Critique
                  </h3>
                  <p className="text-sm font-bold leading-relaxed italic opacity-95">"{evaluation.feedback}"</p>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Key Improvements
                  </h3>
                  <ul className="space-y-3">
                    {evaluation.coachingTips.map((tip, idx) => (
                      <li key={idx} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-sm font-bold text-slate-600">
                        <span className="w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center text-[10px] shrink-0">{idx + 1}</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </section>

                {evaluation.improvementAreas && evaluation.improvementAreas.length > 0 && (
                  <section>
                    <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
                      <AlertCircle className="w-4 h-4 text-brand-red" />
                      Growth Focus
                    </h3>
                    <div className="flex flex-wrap gap-2">
                       {evaluation.improvementAreas.map((area, idx) => (
                         <span key={idx} className="px-3 py-1 bg-brand-red/10 text-brand-red text-[10px] font-black uppercase rounded-full">
                           {area}
                         </span>
                       ))}
                    </div>
                  </section>
                )}
              </div>

              <section className="flex flex-col">
                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
                  <Lightbulb className="w-4 h-4 text-brand-orange" />
                  Expert Redraft
                </h3>
                <div className="flex-1 bg-white rounded-[32px] border-b-8 border-slate-200 border-x-2 border-t-2 p-6 text-sm leading-relaxed text-slate-600 italic font-medium relative">
                  "{evaluation.improvedResponse}"
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent opacity-20"></div>
                </div>
                
                <button
                  onClick={() => {
                    setEvaluation(null);
                    setCurrentScenario(null);
                  }}
                  className="chunky-button-green w-full mt-6"
                >
                  Keep Practicing
                </button>
              </section>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {showLevelUp && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowLevelUp(false)}
            >
              <div className="bg-white rounded-[40px] p-10 text-center max-w-sm w-full shadow-2xl border-b-[12px] border-brand-purple">
                <motion.div
                  animate={{ y: [0, -20, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-24 h-24 bg-brand-purple rounded-[32px] flex items-center justify-center mx-auto mb-6 text-white shadow-[0_8px_0_0_#AC52FF]"
                >
                  <Trophy className="w-12 h-12" />
                </motion.div>
                <h3 className="text-3xl font-black uppercase tracking-tight mb-2 text-brand-purple">New Mastery!</h3>
                <p className="text-slate-500 font-bold mb-8">You've reached level {stats.level} and mastered new techniques.</p>
                <button
                  onClick={() => setShowLevelUp(false)}
                  className="chunky-button-blue w-full"
                >
                  Incredible!
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (currentScenario) {
    return (
      <div className="min-h-screen bg-[#F0F4F8]">
        <header className="p-6 flex items-center justify-between border-b-2 border-slate-200 bg-white">
          <button 
            onClick={() => setCurrentScenario(null)}
            className="p-3 bg-slate-100 rounded-2xl hover:bg-brand-red hover:text-white transition-all text-slate-400"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3]" />
          </button>
          <div className="flex-1 h-3 bg-slate-200 rounded-full mx-8">
            <motion.div 
               className="h-full bg-brand-green rounded-full shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]"
               initial={{ width: 0 }}
               animate={{ width: "65%" }}
            />
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right hidden sm:block">
               <div className="text-[10px] font-black uppercase text-slate-400">XP Reward</div>
               <div className="text-xs font-black text-brand-orange flex items-center justify-end gap-1">
                 <Zap className="w-4 h-4 fill-current" />
                 {currentScenario.xpReward}
               </div>
             </div>
             <div className="w-10 h-10 bg-brand-purple rounded-xl flex items-center justify-center text-white shadow-[0_4px_0_0_#AC52FF]">
               <Award className="w-6 h-6" />
             </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[32px] border-b-8 border-slate-200 p-8">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-6">
                  {getIcon(currentScenario.icon)}
                </div>
                <h2 className="text-3xl font-black mb-4 uppercase tracking-tight text-[#3C3C3C]">{currentScenario.title}</h2>
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 mb-6">
                   <p className="text-xs font-black uppercase text-brand-blue mb-2">Practice Task</p>
                   <p className="text-xl text-slate-600 font-bold leading-relaxed italic">"{currentScenario.prompt}"</p>
                </div>
                <p className="text-sm font-bold text-slate-400 bg-brand-blue/5 p-4 rounded-xl border border-brand-blue/10">
                   💡 <span className="text-brand-blue">Speak out loud!</span> For best results, imagine the person is sitting right in front of you. Focus on your tone and cadence.
                </p>
              </div>

              <div className="bg-brand-blue rounded-[32px] p-6 text-white shadow-[0_6px_0_0_#1899D6] relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-brand-blue font-black shrink-0">!</div>
                    <h3 className="font-black text-lg uppercase tracking-wider">Coach Context</h3>
                  </div>
                  <p className="text-sm font-bold opacity-90 leading-relaxed">
                    This scenario measures your ability to be concise. Try to finish your answer in under 45 seconds.
                  </p>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-10">
                   <Volume2 className="w-24 h-24" />
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[32px] border-b-8 border-slate-200 border-x-2 border-t-2 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b-2 border-slate-100 flex gap-2">
                  <button
                    onClick={() => {
                      setPracticeMode('audio');
                      stopCamera();
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${practiceMode === 'audio' ? 'bg-brand-blue text-white shadow-[0_4px_0_0_#1899D6]' : 'bg-white text-slate-400 border-2 border-slate-200'}`}
                  >
                    <Mic className="w-4 h-4" />
                    Voice Only
                  </button>
                  <button
                    onClick={() => setPracticeMode('video')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${practiceMode === 'video' ? 'bg-brand-purple text-white shadow-[0_4px_0_0_#AC52FF]' : 'bg-white text-slate-400 border-2 border-slate-200'}`}
                  >
                    <Video className="w-4 h-4" />
                    Video + Voice
                  </button>
                </div>
                <div className="flex justify-between items-center p-6 border-b-2 border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    {isRecording ? (
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }} 
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-3 h-3 bg-brand-red rounded-full" 
                      />
                    ) : (
                      <div className="w-3 h-3 bg-slate-300 rounded-full" />
                    )}
                    <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {isRecording ? `Recording... (${formatTime(recordingTime)})` : `${practiceMode === 'video' ? 'Camera' : 'Microphone'} Ready`}
                    </label>
                  </div>
                  <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${practiceMode === 'video' ? 'bg-brand-purple/10 text-brand-purple' : 'bg-slate-100 text-slate-500'}`}>
                    Input: {practiceMode === 'video' ? 'Video' : 'Audio'}
                  </span>
                </div>
                
                <div className="relative min-h-[320px] bg-slate-900 group">
                  {practiceMode === 'video' ? (
                    <div className="absolute inset-0">
                      {isRecording || videoStream ? (
                         <video
                           ref={videoPreviewRef}
                           autoPlay
                           muted
                           playsInline
                           className="w-full h-full object-cover mirror"
                         />
                      ) : recordedVideoUrl ? (
                        <video
                          src={recordedVideoUrl}
                          controls
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/40 gap-4">
                           <div className="p-6 rounded-full bg-white/5 border-2 border-dashed border-white/20">
                             <Camera className="w-12 h-12" />
                           </div>
                           <button 
                             onClick={startCamera}
                             className="px-6 py-2 bg-brand-purple text-white rounded-full font-black uppercase text-xs tracking-widest shadow-[0_4px_0_0_#AC52FF]"
                           >
                             Enable Camera
                           </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                      <Mic className="w-48 h-48" />
                    </div>
                  )}

                  <textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder={practiceMode === 'video' ? "Transcript will appear here..." : "Speak out loud, and your transcript will appear here..."}
                    className={`w-full h-80 p-8 border-none focus:ring-0 text-xl leading-relaxed font-bold resize-none bg-transparent placeholder:text-slate-300 relative z-10 ${practiceMode === 'video' ? 'text-white drop-shadow-md bg-black/20' : 'text-slate-700'}`}
                  />
                </div>

                <div className="p-6 bg-slate-50 flex justify-center border-t-2 border-slate-100">
                  <button 
                    onClick={toggleRecording}
                    className={`
                      w-20 h-20 rounded-full flex items-center justify-center transition-all pointer-events-auto
                      ${isRecording 
                        ? 'bg-brand-red text-white shadow-[0_6px_0_0_#992D2D] hover:scale-95' 
                        : practiceMode === 'video' 
                          ? 'bg-brand-purple text-white shadow-[0_6px_0_0_#AC52FF] hover:scale-105'
                          : 'bg-brand-blue text-white shadow-[0_6px_0_0_#1899D6] hover:scale-105'}
                    `}
                  >
                    {isRecording ? <MicOff className="w-10 h-10" /> : practiceMode === 'video' ? <Video className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  disabled={!response.trim() || response.length < 10 || isRecording}
                  onClick={handleSubmit}
                  className="chunky-button-green w-full text-xl disabled:opacity-50 disabled:grayscale"
                >
                  Analyze My Speech
                </button>
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Press analyze when you finish speaking
                </p>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      {/* Top Profile Bar */}
      <nav className="h-20 bg-white border-b-2 border-slate-200 px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-green rounded-xl flex items-center justify-center shadow-[0_4px_0_0_#46A302]">
            <span className="text-white font-black text-2xl">C</span>
          </div>
          <span className="font-black text-2xl tracking-tight text-brand-green hidden sm:block uppercase">COMMUNI-GO</span>
        </div>
        
        <div className="flex items-center gap-4 sm:gap-10">
          <div className="flex items-center gap-2">
            <span className="text-[#FF9600] text-2xl drop-shadow-sm">🔥</span>
            <span className="font-black text-slate-400 text-sm hidden sm:block uppercase">4 DAY STREAK</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-brand-blue text-2xl drop-shadow-sm">💎</span>
            <span className="font-black text-slate-400 text-sm">{stats.xp}</span>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="p-2 text-slate-400 hover:text-brand-red transition-colors"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 bg-brand-red rounded-full border-4 border-slate-100 shadow-sm flex items-center justify-center text-white text-xs font-black">
            L{stats.level}
          </div>
        </div>
      </nav>

      {/* Main Path */}
      <main className="max-w-xl mx-auto p-8 space-y-12">
        <section>
          <div className="mb-8 text-center sm:text-left">
            <h2 className="text-3xl font-black text-[#3C3C3C] uppercase tracking-tight mb-4">Vocal Track</h2>
            <div className="max-w-xs mx-auto sm:mx-0">
               <ProgressBar progress={((stats.xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100} label={`Next Level in ${XP_PER_LEVEL - (stats.xp % XP_PER_LEVEL)} XP`} />
            </div>
          </div>

          <div className="grid gap-6">
            {SCENARIOS.map((scenario, index) => {
              const locked = !canAccess(scenario);
              const completed = stats.completedScenarios.includes(scenario.id);
              
              return (
                <motion.button
                  key={scenario.id}
                  whileHover={!locked ? { y: -4 } : {}}
                  disabled={locked}
                  onClick={() => handleStartScenario(scenario)}
                  className={`
                    w-full relative group p-6 rounded-[32px] border-b-8 transition-all
                    ${locked 
                      ? 'bg-slate-200/50 border-slate-300 opacity-50 cursor-not-allowed' 
                      : 'bg-white border-slate-200 border-x-2 border-t-2 hover:border-b-[12px] active:border-b-2 active:translate-y-2'
                    }
                  `}
                >
                  <div className="flex items-center gap-6">
                    <div className={`
                      w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-inner
                      ${completed ? 'bg-brand-green text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]' : 
                        locked ? 'bg-slate-300 text-white' : 'bg-brand-blue text-white shadow-[inset_0_-4px_0_#1899D6]'}
                    `}>
                      {completed ? <CheckCircle2 className="w-8 h-8 stroke-[3]" /> : getIcon(scenario.icon)}
                    </div>
                    
                    <div className="text-left flex-1">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {scenario.type}
                        </span>
                      </div>
                      <h3 className={`text-xl font-black uppercase tracking-tight leading-tight mb-1 ${locked ? 'text-slate-400' : 'text-[#3C3C3C]'}`}>
                        {scenario.title}
                      </h3>
                      <p className={`text-sm font-bold leading-relaxed ${locked ? 'text-slate-300' : 'text-slate-500'}`}>
                        {locked ? `Unlocks at Level ${scenario.difficulty === Difficulty.INTERMEDIATE ? 3 : 6}` : scenario.description}
                      </p>
                    </div>

                    {!locked && !completed && (
                      <div className="hidden sm:flex w-10 h-10 rounded-full bg-slate-100 items-center justify-center group-hover:bg-brand-green group-hover:text-white transition-all text-slate-400">
                        <ChevronRight className="w-6 h-6 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Global Stats/Legend */}
        <section className="bg-brand-blue rounded-[32px] p-8 text-white relative overflow-hidden shadow-[0_8px_0_0_#1899D6]">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-blue shadow-[0_4px_0_0_rgba(255,255,255,0.3)]">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Your Mastery</h3>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: 'Avg clarity', val: '8.4', color: 'text-white' },
                { label: 'Practice', val: stats.completedScenarios.length, color: 'text-white' },
                { label: 'Rank', val: stats.rank, color: 'text-white' }
              ].map((s, i) => (
                <div key={i} className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm border border-white/20">
                  <div className={`text-xl font-black ${s.color}`}>{s.val}</div>
                  <div className="text-[10px] font-black uppercase opacity-60 tracking-widest mt-1">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/5 rounded-full blur-3xl" />
        </section>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-[#3C3C3C] uppercase tracking-tight">Recent Sessions</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{sessions.length} RECORDED</span>
            </div>
            <div className="space-y-4">
              {sessions.slice(0, 3).map((session) => (
                <div 
                  key={session.id}
                  className="bg-white rounded-[24px] border-b-4 border-slate-200 p-6 flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${session.type === 'video' ? 'bg-brand-purple/10 text-brand-purple' : 'bg-brand-blue/10 text-brand-blue'}`}>
                          {session.type}
                        </span>
                        <h4 className="text-sm font-black text-slate-600 uppercase tracking-tight">
                          {SCENARIOS.find(s => s.id === session.scenarioId)?.title || 'Exercise'}
                        </h4>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {(() => {
                          const date = session.createdAt && typeof session.createdAt === 'object' && 'toMillis' in session.createdAt 
                            ? new Date(session.createdAt.toMillis()) 
                            : new Date(session.createdAt);
                          return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                        })()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-brand-green">{session.evaluation.totalScore}</div>
                      <div className="text-[8px] font-black text-slate-400 uppercase">Score</div>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-500 italic leading-relaxed">
                      "{session.evaluation.feedback.slice(0, 100)}..."
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.evaluation.improvementAreas.slice(0, 2).map((area, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-400 text-[8px] font-black uppercase rounded-lg">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
