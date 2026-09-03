import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Headphones,
  X,
  Send,
  PlusCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { SupportTicket } from '../../types';

export const SupportModal: React.FC = () => {
  const {
    isSupportOpen,
    setIsSupportOpen,
    user,
    supportTickets,
    createSupportTicket,
    sendSupportMessage,
  } = useApp();

  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isSupportOpen) return null;

  // Filter tickets for this user
  const userTickets = supportTickets
    .filter((t) => t.userId === user.id || (!t.userId && t.userPhone === user.phone))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const activeTicket: SupportTicket | undefined = userTickets.find((t) => t.id === activeTicketId);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setIsSubmitting(true);
    try {
      const newId = await createSupportTicket(subject, message);
      setSubject('');
      setMessage('');
      setIsCreatingNew(false);
      setActiveTicketId(newId);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeTicketId) return;
    const textToSend = replyText;
    setReplyText('');
    await sendSupportMessage(activeTicketId, textToSend);
  };

  const presets = [
    'مشكلة في شحن الرصيد / الإيداع',
    'استفسار بخصوص طلب السحب',
    'شحن رصيد مباشر عبر الأدمن',
    'طلب مساعدة تقنية في الألعاب',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="w-full max-w-xl bg-[#0f172a] text-slate-100 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900/60 via-[#1e293b] to-slate-900 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/30 border border-blue-400/30 text-blue-400 flex items-center justify-center shadow-inner">
              <Headphones className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base text-white">
                  خدمة العملاء والدعم الفني المباشر
                </span>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  مباشر 24/7
                </span>
              </div>
              <span className="text-xs text-slate-400">
                تواصل مع الإدارة مباشرة لمتابعة الإيداعات والسحوبات والشكاوى
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setIsSupportOpen(false);
              setActiveTicketId(null);
              setIsCreatingNew(false);
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* View 1: Active Ticket Chat Details */}
          {activeTicket ? (
            <div className="flex flex-col h-full flex-1 gap-3">
              {/* Back to list bar */}
              <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700/60">
                <button
                  onClick={() => setActiveTicketId(null)}
                  className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 transition cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>العودة لقائمة المحادثات</span>
                </button>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono">ID: {activeTicket.id}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTicket.status === 'open'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {activeTicket.status === 'open' ? 'قيد المتابعة' : 'مكتملة'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium">موضوع التذكرة:</span>
                <p className="text-sm font-bold text-white mt-0.5">{activeTicket.subject}</p>
              </div>

              {/* Chat Thread Messages */}
              <div className="flex-1 overflow-y-auto min-h-56 max-h-72 p-3 bg-[#0b1324] rounded-2xl border border-slate-800 flex flex-col gap-3">
                {(!activeTicket.messages || activeTicket.messages.length === 0) ? (
                  <p className="text-center text-xs text-slate-500 py-6">لا توجد رسائل بعد</p>
                ) : (
                  activeTicket.messages.map((msg, i) => {
                    const isAdmin = msg.sender === 'admin';
                    return (
                      <div
                        key={msg.id || i}
                        className={`flex flex-col gap-1 max-w-[85%] ${
                          isAdmin ? 'self-start items-start' : 'self-end items-end'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          {isAdmin ? (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                              <span className="font-bold text-blue-300">الدعم الفني / الإدارة</span>
                            </>
                          ) : (
                            <>
                              <User className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="font-bold text-emerald-300">أنت</span>
                            </>
                          )}
                          <span className="font-mono">
                            {new Date(msg.timestamp).toLocaleTimeString('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div
                          className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-md ${
                            isAdmin
                              ? 'bg-gradient-to-r from-blue-900/80 to-indigo-900/80 text-white rounded-tr-none border border-blue-700/50'
                              : 'bg-gradient-to-r from-emerald-800/80 to-teal-800/80 text-white rounded-tl-none border border-emerald-600/50'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Reply Input Box */}
              <form onSubmit={handleSendReply} className="flex gap-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="اكتب ردك أو استفسارك هنا للإدارة..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim()}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <Send className="w-4 h-4" />
                  <span>إرسال</span>
                </button>
              </form>
            </div>
          ) : isCreatingNew ? (
            /* View 2: Create New Support Ticket Form */
            <form onSubmit={handleCreateTicket} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">إنشاء تذكرة دعم جديدة</span>
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">مواضيع شائعة وسريعة:</span>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSubject(p)}
                      className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-300 font-medium transition cursor-pointer"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-300">عنوان التذكرة / المشكلة:</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: استفسار حول إيداع فودافون كاش"
                  required
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-300">تفاصيل الرسالة أو الشكوى:</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="يرجى كتابة تفاصيل المشكلة ورقم المحفظة إن وجد لمساعدتك سريعاً..."
                  rows={4}
                  required
                  className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !subject.trim() || !message.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'جاري الإرسال...' : 'إرسال التذكرة للإدارة'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : (
            /* View 3: List of existing tickets & Open New Button */
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">سجل تذاكر ورسائل الدعم الخاصة بك:</span>
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>تذكرة جديدة</span>
                </button>
              </div>

              {userTickets.length === 0 ? (
                <div className="py-10 px-4 flex flex-col items-center justify-center text-center gap-3 bg-slate-900/40 rounded-2xl border border-slate-800/80">
                  <div className="w-14 h-14 rounded-full bg-slate-800/80 flex items-center justify-center text-blue-400">
                    <MessageSquare className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-bold text-white">لا توجد رسائل دعم سابقة</span>
                  <p className="text-xs text-slate-400 max-w-sm">
                    إذا كان لديك أي استفسار أو مشكلة في شحن الرصيد أو السحب، اضغط على زر "تذكرة جديدة" وسيصل طلبك للإدارة مباشرة.
                  </p>
                  <button
                    onClick={() => setIsCreatingNew(true)}
                    className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs shadow-md hover:opacity-90 transition cursor-pointer"
                  >
                    بدء محادثة جديدة مع الدعم
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {userTickets.map((t) => {
                    const lastMsg = t.messages?.[t.messages.length - 1];
                    const hasAdminReply = t.messages?.some((m) => m.sender === 'admin');

                    return (
                      <div
                        key={t.id}
                        onClick={() => setActiveTicketId(t.id)}
                        className="p-3.5 bg-[#131d33] hover:bg-[#1a2642] rounded-2xl border border-slate-800 hover:border-slate-700 transition cursor-pointer flex items-start justify-between gap-3 group"
                      >
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              hasAdminReply
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {hasAdminReply ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              <Clock className="w-4 h-4 animate-pulse" />
                            )}
                          </div>

                          <div className="flex flex-col gap-1 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-blue-300 transition">
                                {t.subject}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(t.updatedAt).toLocaleDateString('ar-EG', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            {lastMsg && (
                              <p className="text-xs text-slate-300 line-clamp-1">
                                <span className="font-bold text-slate-400">
                                  {lastMsg.sender === 'admin' ? 'الإدارة: ' : 'أنت: '}
                                </span>
                                {lastMsg.text}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-slate-500 font-mono">ID: {t.id}</span>
                              {hasAdminReply && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.2 rounded-full font-bold">
                                  تم الرد من الإدارة ✅
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition transform group-hover:-translate-x-1" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
