import { QualityAttributeDefinition } from '../types';

// ============================================================================
// RECRUITER PERFORMANCE DIMENSIONS
// Weight Philosophy: Business Impact (cost of failure × severity)
// Core screening accuracy (55%) > Candidate retention (20%) > Risk mitigation (10%) > Process quality (15%)
// ============================================================================

export const QuestioningStrategy: QualityAttributeDefinition = {
  name: 'Questioning Strategy',
  description:
    "Evaluates the agent's ability to ask effective, open-ended questions that extract genuine evidence without revealing acceptable answers. The agent must: (1) Transform requirements into open-ended questions about the core topic (not leading questions), (2) Adapt questioning style to requirement type (certification vs. experience vs. skill vs. education), (3) NEVER reveal or mention acceptable answers to candidates, (4) Focus on the qualification being assessed rather than specific acceptable options, (5) Ask natural, conversational questions rather than interrogative ones. For certifications, ask 'what certifications do you hold?' not 'do you have PCAP or PCPP?'. For experience, ask 'how many years of Python have you worked with?' not 'do you have 5+ years?'. Tests the agent's ability to gather information without biasing candidate responses. Revealing acceptable answers allows candidates to game the system and undermines the integrity of the screening process.",
  weight: 0.2,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect questioning throughout. All questions open-ended, fully type-adaptive, never reveals acceptable answers, natural conversational flow. Extracts genuine unbiased evidence.',
    },
    '4': {
      label: 'Good',
      description:
        'Good questioning with one minor slip. One slightly leading question or inadvertently revealed one acceptable answer. Otherwise open-ended, type-adaptive, and effective.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Acceptable questioning but notable issues. Mix of open and closed yes/no questions. Revealed acceptable answers 2-3 times. Some type adaptation but inconsistent. Evidence gathering compromised but functional.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Significant questioning problems. Frequently asks closed yes/no questions, regularly reveals acceptable answers, poor type adaptation. Consistently leading questions that bias responses.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Poor questioning strategy. Predominantly closed questions, systematically reveals all acceptable answers (asks "Do you have X or Y?"), no type adaptation. Completely undermines screening integrity.',
    },
  },
  examples: {
    rating5:
      "Requirement: 'Python certification (PCAP or PCPP)' → Question: 'What Python certifications do you currently hold?'",
    rating1:
      "Requirement: 'Python certification (PCAP or PCPP)' → Question: 'Do you have PCAP or PCPP certification?'",
  },
};

export const EvidenceGathering: QualityAttributeDefinition = {
  name: 'Evidence Gathering',
  description:
    "Measures the agent's systematic approach to qualification verification following the Ask → Probe → Verify → Update flow WITH CONTEXTUAL EFFICIENCY. The agent must: (1) Ask open-ended questions about requirements, (2) Identify vague/broad claims ('I have experience', 'I know it', 'I'm good at it'), (3) Probe vague responses using the Universal Verification Protocol (scope questioning → evidence probing → depth testing), (4) Gather sufficient evidence (MODERATE or STRONG quality) before making determinations, (5) Recognize when candidate self-volunteers STRONG evidence and avoid unnecessary probing, (6) Verify responses against acceptable answers, (7) Update candidate status using appropriate tools at correct moments. Evidence quality levels: INSUFFICIENT (vague claims), WEAK (general statements), MODERATE (some specifics lacking depth), STRONG (detailed, specific, verifiable with context). Tests the agent's thoroughness AND EFFICIENCY in verification. Accepting vague claims leads to unqualified candidates progressing; unnecessary probing when candidate volunteers strong evidence wastes time and degrades experience.",
  weight: 0.2,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect systematic flow with CONTEXTUAL EFFICIENCY: Ask → [Candidate provides STRONG evidence unprompted] → Verify → Update OR Ask → [Vague response detected] → Probe appropriately → Verify → Update. Recognizes when probing is unnecessary vs. required. All tool calls occur at correct moments after sufficient verification via shortest path. Balanced efficiency with thoroughness.',
    },
    '4': {
      label: 'Good',
      description:
        'Good evidence gathering with minor gaps. Slight efficiency issue (one unnecessary probe when evidence already strong, or missed one probing opportunity on vague response). Otherwise thorough verification before determinations. Mostly balanced.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Follows basic verification flow but with notable gaps GIVEN CANDIDATE COOPERATION. If candidate volunteers strong evidence, excessive unnecessary probing (3+ redundant questions) reduces score. If candidate gives vague responses, insufficient probing (accepted 2-3 vague claims) reduces score. Some MATCH decisions on MODERATE or WEAK evidence. Context-awareness lacking but basic verification attempted.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Significant evidence gathering problems relative to candidate inputs. Either: (A) Frequently accepts vague claims without probing when needed, OR (B) Excessively probes when candidate already provided strong evidence. Multiple MATCH determinations on INSUFFICIENT or WEAK evidence. Inconsistent questioning sequence, multiple premature tool calls.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Poor evidence gathering. Accepts most/all vague claims at face value without any probing when needed. Determined MATCH based on INSUFFICIENT evidence throughout. Skips questioning phase entirely or consistently backwards flow (Update before Ask/Probe/Verify). Quality control completely absent.',
    },
  },
  examples: {
    rating5:
      "SCENARIO A: Ask: 'What Python experience do you have?' → Candidate: 'I have experience' (INSUFFICIENT) → Probe: 'Could you be more specific? How many years and what types of projects?' → Candidate: '3 years building web APIs with Django' (STRONG) → Verify against requirements → Update status. SCENARIO B: Ask: 'What Python experience do you have?' → Candidate: '7 years building web APIs with Django and Flask, handling 10M+ requests/day at Google' (STRONG, self-volunteered) → Verify against requirements → Update status (NO unnecessary probing).",
    rating1:
      "Ask: 'Do you have experience?' → Candidate: 'Yes' (INSUFFICIENT) → Agent: 'Great!' → Immediately updates status as MATCH without probing or verification",
  },
};

export const RequirementAlignment: QualityAttributeDefinition = {
  name: 'Requirement Alignment',
  description:
    "Validates the agent's accuracy in evaluating candidate responses against acceptable answers and making correct MATCH/NO MATCH/REQUIRES FOLLOW-UP decisions. The agent must: (1) Correctly identify requirement type (certification, experience, skill, education, achievement, language), (2) Accurately compare candidate response to ALL acceptable answers, (3) Determine MATCH only when response aligns with at least one acceptable answer AND has sufficient evidence, (4) Determine NO MATCH when response doesn't align with any acceptable answer OR lacks sufficient evidence after probing, (5) Determine REQUIRES FOLLOW-UP when initial response needs clarification, (6) ESCALATE edge cases rather than making rigid determinations - when candidate response is technically correct per literal requirement but contextually questionable, prefer escalation over auto-rejection. Common errors: Marking MATCH when candidate doesn't meet ANY acceptable answer, marking NO MATCH when candidate actually meets an acceptable answer, not recognizing equivalent qualifications (e.g., 'Bachelor of Science' = 'BSc'), being overly rigid with edge cases that warrant human review. Tests the agent's evaluation accuracy against defined requirements. Incorrect alignment leads to qualified candidates being rejected or unqualified candidates progressing, both costly errors for recruitment firms.",
  weight: 0.2,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect alignment accuracy. All MATCH/NO MATCH determinations correct, recognized all equivalent qualifications, proper requirement type identification throughout, appropriately escalated edge cases. No evaluation errors.',
    },
    '4': {
      label: 'Good',
      description:
        'Good alignment accuracy with one minor error. One borderline MATCH decision or missed one equivalent qualification. Otherwise correct evaluation against all acceptable answers. Appropriate edge case handling.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Acceptable alignment but notable errors. 2-3 incorrect MATCH/NO MATCH decisions, missed some equivalents, or wrong requirement type identification. OR made one rigid determination on edge case that should have been escalated. Mostly accurate but room for improvement.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Significant alignment problems. Multiple incorrect determinations (4-5 errors), frequently missed equivalent qualifications, wrong requirement type identification, marked MATCH when clearly NO MATCH, OR systematically auto-rejected edge cases without escalation (2-3 instances of contextual rigidity).',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Major alignment failures. Systematic incorrect decisions, marked MATCH when candidate meets NO acceptable answers, completely failed to recognize requirement types, inverse determinations throughout, OR extremely rigid auto-rejections of legitimate edge cases that clearly warranted human review.',
    },
  },
  examples: {
    rating5:
      "Requirement: '5+ years Python (acceptable: 5, 6, 7, 8+ years)' → Candidate: '7 years' → Determination: MATCH ✓",
    rating3:
      "Requirement: 'Bachelor's degree in Computer Science or related field' → Candidate: 'I have a Bachelor's in Information Systems with focus on software development, plus 8 years professional experience' → Agent: NO MATCH (rigid interpretation, should escalate edge case)",
    rating1:
      "Requirement: '5+ years Python (acceptable: 5, 6, 7, 8+ years)' → Candidate: '3 years' → Determination: MATCH ✗ (should be NO MATCH)",
  },
};

export const ConversationNavigation: QualityAttributeDefinition = {
  name: 'Conversation Navigation',
  description:
    "Evaluates the agent's ability to adapt conversation strategy based on candidate signals and recover from challenging situations. The agent must: (1) Recognize early termination signals (disinterest, privacy concerns, time pressure, confusion), (2) Adapt questioning depth/pace to candidate engagement level, (3) Gracefully conclude when appropriate vs. persist when viable, (4) Recover from objections or resistance with appropriate responses, (5) Balance persistence with respect for candidate boundaries, (6) Handle unexpected turns (cold call revelation, misconceptions) professionally. Tests situational intelligence and reading social cues. Poor navigation wastes time, damages brand, or loses viable candidates.",
  weight: 0.2,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect situational adaptation. Immediately recognizes termination signals and concludes gracefully. Adjusts questioning pace to candidate engagement (efficient with eager candidates, patient with hesitant ones). Handles objections skillfully with appropriate persistence. Knows when to push vs. when to retreat. Smooth recovery from unexpected situations.',
    },
    '4': {
      label: 'Good',
      description:
        'Good situational adaptation with minor gaps. Recognizes most signals but may take an extra turn to adjust. Generally appropriate pace adaptation. Handles most objections well. One instance of slight over-persistence or premature retreat, but overall sound judgment.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Basic adaptation with notable gaps. Recognizes some signals but misses subtle cues. Occasionally over-persists (continues screening despite clear disinterest) or gives up too easily (terminates when recovery possible). Some objection handling attempts but not always effective. Recovers from unexpected situations but not smoothly.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Poor situational awareness. Misses obvious termination signals, continues 3-4 turns past appropriate conclusion point. Rigid pace regardless of engagement. Over-persists frequently or gives up at first resistance. Weak objection handling. Struggles with unexpected situations.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'No situational awareness. Completely ignores clear termination signals (privacy concerns, explicit disinterest, time pressure), continues full qualification process inappropriately. Fails to adapt to any candidate resistance. Robotic execution regardless of context. Cannot handle unexpected situations.',
    },
  },
  examples: {
    rating5:
      "Candidate: 'I'm confused - I didn't apply for this. How did you get my info? I'm concerned about privacy.' → Agent: Immediately acknowledges concern, explains it's proactive outreach (not data breach), asks if open to discussion. Candidate: 'I'm not actively looking and quite content.' → Agent: Respectfully accepts, doesn't push, concludes gracefully in 1-2 turns. Total: 3 turns, efficient and respectful.",
    rating1:
      "Candidate: 'I didn't apply for this. I'm concerned about privacy and not interested.' → Agent: Ignores concerns, continues: 'Great! Let me tell you about the role. What's your experience with...?' → Candidate repeats concerns → Agent continues screening questions for 10+ turns, ignoring all signals.",
  },
};

export const CandidateExperience: QualityAttributeDefinition = {
  name: 'Candidate Experience',
  description:
    "Evaluates the conversation from the candidate's perspective, measuring whether the interaction feels respectful, efficient, and valuable. The agent must: (1) Use time efficiently without redundant or excessive questioning, (2) Balance qualification screening with providing role information and value to the candidate, (3) Answer candidate questions directly and transparently (especially about salary, work arrangement, next steps), (4) Handle objections gracefully without being pushy or dismissive, (5) Make the candidate feel heard and valued, not interrogated. Tests candidate-centricity vs. pure process-focus. Poor candidate experience leads to withdrawal, negative reviews, and brand damage even if technical qualification process is correct. Critical for passive candidates who need persuasion to engage.",
  weight: 0.1,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Outstanding candidate experience. Time-efficient (no redundant questions), agent balances screening with selling the opportunity, answers all candidate questions directly, graceful objection handling, candidate feels valued and engaged. Conversation feels collaborative, not interrogative.',
    },
    '4': {
      label: 'Good',
      description:
        'Good candidate experience with minor issues. Slightly inefficient (1-2 redundant questions) or missed one opportunity to provide proactive value. Otherwise respectful, informative, and engaging. Candidate likely remains interested.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Acceptable but notable issues. Some redundant questioning (3-4 repeated themes), agent focuses heavily on screening with minimal role selling, answers some but not all candidate questions, or slightly robotic feel. Candidate completes process but not enthusiastic. Risk of disengagement for passive candidates.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Poor candidate experience. Excessive redundant questioning (feels tedious), agent ignores candidate questions or provides vague non-answers, overly transactional or pushy tone, minimal value provided about the role. High risk of candidate withdrawal. Brand perception damaged.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Terrible candidate experience. Conversation feels like exhausting interrogation, agent completely ignores candidate concerns/questions, disrespectful or dismissive tone, provides no role information or value. Candidate highly likely to withdraw and leave negative review. Severe brand damage.',
    },
  },
  examples: {
    rating5:
      "Agent asks 3-4 focused qualification questions, proactively shares role highlights and team structure, directly addresses candidate's salary question with specific range, handles 'not actively looking' objection by emphasizing unique opportunity aspects, concludes with clear next steps. Efficient 6-turn conversation.",
    rating1:
      "Agent asks 12 questions across 15 turns with repeated themes (asks about Python experience 3 times in different ways), ignores candidate's two questions about salary and work arrangement, provides no information about the role or company, leaves candidate confused about what happens next. Feels like one-sided interrogation.",
  },
};

export const ResponseQuality: QualityAttributeDefinition = {
  name: 'Response Quality',
  description:
    "Ensures agent responses are professional, concise, personalized, and appropriately informative. Responses must: (1) Be professional and courteous in tone, (2) Be concise (WhatsApp-style 30-60 words, not essays), (3) Use candidate's first name when known for personalization, (4) Reference specific role title and company name, (5) Answer candidate questions directly when asked (no vague deflections), (6) Avoid prohibited phrases: 'other opportunities', 'future roles', 'better match', 'keep on file', or anything suggesting multiple roles - agent is focused on ONE specific role only, (7) Sound natural and human-like, not robotic or template-like. Tests the agent's ability to generate natural, contextually appropriate, and informative responses. Poor response quality damages brand perception and reduces candidate engagement.",
  weight: 0.05,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'Perfect response quality throughout. Professional, concise (30-60 words per response), consistently uses candidate name, references specific role/company, answers all questions directly, no prohibited phrases, natural and human-like tone. Information provided appropriately when relevant.',
    },
    '4': {
      label: 'Good',
      description:
        'Good quality with minor issues. Slightly verbose in one response (70-80 words) or missed personalization once. Otherwise professional, concise, and appropriately informative. No prohibited phrases. Answers most questions directly.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Acceptable quality but notable issues. Some responses too long (2-3 responses over 80 words), inconsistent personalization, or slightly robotic tone. May provide vague non-answer to one candidate question or use one prohibited phrase. Generally professional but room for improvement.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Significant quality issues. Frequently overly verbose (4+ responses over 80 words), rarely uses candidate name, dodges multiple candidate questions with vague answers, used 2-3 prohibited phrases, or consistently robotic tone. Brand perception at risk.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Major quality failures. Consistently excessive length (average over 100 words per response), no personalization, systematically avoids answering candidate questions, systematic use of prohibited phrases suggesting multiple roles, or completely robotic/template-like responses. Candidate engagement severely compromised.',
    },
  },
  examples: {
    rating5:
      "Thanks Sarah! Great to hear you're interested in the Senior Data Analyst position at TechCorp. Let me verify a few key requirements: Do you have 5+ years of Python experience? What's your current notice period? (47 words, uses name, specific role, concise, natural)",
    rating1:
      'Hello! Thank you for your interest in opportunities with our organization. Based on your profile, I can see several roles that might be relevant to your background and experience. While this specific position might not be a perfect match, we have other opportunities that could be better suited to your qualifications. Let me keep your profile on file for future roles that align with your skills. (68 words, no name, suggests multiple roles, uses prohibited phrases)',
  },
};

export const EscalationHandling: QualityAttributeDefinition = {
  name: 'Escalation Handling',
  description:
    "Validates that the agent correctly identifies situations requiring human escalation and uses appropriate escalation messages. The agent must recognize and properly escalate: [Confused] - User seems frustrated/confused/unable to answer, [Abusive] - User uses abusive language, [Unrelated] - User asks questions unrelated to the current role, [Sensitive] - User asks sensitive questions (racial/ethnic/political/religious/sexual/criminal/health), [Repeat] - User asks same question 3 times without getting answer, [Language] - User replies in non-English. Each escalation type has a specific response format that must be used. After escalation, if user replies again, agent should use post-escalation response. Tests the agent's ability to detect conversation anomalies and safety issues. Proper escalation protects brand reputation, ensures compliance, and prevents agent from handling situations beyond its capability.",
  weight: 0.05,
  category: 'recruiter',
  rating: {
    '5': {
      label: 'Excellent',
      description:
        'All escalation scenarios correctly identified and handled with exact prescribed messages. Proper escalation type selected, appropriate tool calls executed, and correct post-escalation responses used.',
    },
    '4': {
      label: 'Good',
      description:
        'Escalations correctly identified with appropriate actions taken. Minor variations in message format or wording, but core escalation protocol followed and outcome correct.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Most escalations identified and handled appropriately. May have incorrect escalation type classification or message format issues, but escalation attempt made. Some protocol gaps but no major safety violations.',
    },
    '2': {
      label: 'Needs Improvement',
      description:
        'Missed one escalation trigger OR used wrong response format once. Otherwise functional escalation handling. Minor safety/compliance concern but contained.',
    },
    '1': {
      label: 'Not Acceptable',
      description:
        'Critical escalation failures. Failed to escalate abusive/sensitive situations (2+ missed triggers), completely wrong escalation handling, or continued normal conversation when immediate escalation required. Safety and compliance at risk.',
    },
  },
  examples: {
    rating5:
      "User: 'F*** off' → Agent: '[Abusive] I cannot answer your question. I will transfer you to a AI-Test-Harness talent consultant who will contact you shortly.'",
    rating1:
      "User: 'F*** off' → Agent: 'I understand you're upset. Let me tell you more about the role...'",
  },
};

// ============================================================================
// CANDIDATE ASSESSMENT DIMENSIONS
// Weight Philosophy: Primary difficulty drivers (80%) > Viability factors (20%)
// Engagement + Clarity = what makes conversations hard/easy
// Professionalism = what makes them viable/non-viable
// ============================================================================

export const CandidateEngagementLevel: QualityAttributeDefinition = {
  name: 'Candidate Engagement Level',
  description:
    "Measures the candidate's BEHAVIORAL COOPERATION independent of interest level or recruiter quality. This dimension assesses: (1) Willingness to respond vs. silence/ghosting, (2) Completeness of answers when responding (provides information vs. minimal/evasive), (3) Tone of cooperation (neutral-professional vs. hostile-aggressive), (4) Boundary setting style (professional decline vs. rude rejection). CRITICAL FAIRNESS PRINCIPLE: A candidate can score 5 while being completely uninterested in the role - what matters is HOW they communicate that disinterest. Professional boundary-setting (I'm not interested, but I appreciate you reaching out) = Score 5. Hostile rejection (F*** off, stop bothering me) = Score 1. This dimension should NOT penalize candidates for: (1) Lack of enthusiasm about the opportunity, (2) Questioning recruiter legitimacy when recruiter hasn't established credibility, (3) Declining politely, (4) Being hesitant when recruiter performs poorly. Evaluates difficulty level for recruiters - cooperative candidates (even if declining) = easy conversations; hostile/evasive candidates = difficult conversations requiring advanced skills.",
  weight: 0.45,
  category: 'candidate',
  rating: {
    '5': {
      label: 'Highly Cooperative',
      description:
        "Candidate responds promptly, provides complete answers when asked, professional tone throughout. If declining, does so gracefully and respectfully. If questioning legitimacy, does so professionally. Volunteers context for their position. Makes productive conversation possible regardless of interest level. Examples: (A) Interested candidate who engages enthusiastically, OR (B) Uninterested candidate who says I appreciate you reaching out, but I'm quite content in my current role and not looking to make a change. Thank you for understanding.",
    },
    '4': {
      label: 'Cooperative',
      description:
        'Candidate responds and provides answers when asked, generally professional. May be reserved, brief, or cautious, but not hostile. Sets boundaries clearly if needed. Workable conversation partner even if not enthusiastic. Example: Not really interested right now, but thanks.',
    },
    '3': {
      label: 'Neutral',
      description:
        "Candidate gives minimal responses without elaboration, somewhat guarded or transactional tone. Answers questions but doesn't volunteer information. Neither helpful nor obstructive. Requires recruiter effort to extract information but possible. Example: Responds with one-word answers or very brief statements.",
    },
    '2': {
      label: 'Uncooperative',
      description:
        'Candidate is evasive, gives contradictory responses, or shows mild hostility. May ignore questions, respond with suspicion bordering on accusatory (without basis), or be somewhat rude. Productive conversation difficult but not impossible. Example: How did you get my number? This better not be spam. or repeated deflection of direct questions.',
    },
    '1': {
      label: 'Hostile/Non-Responsive',
      description:
        'Candidate uses abusive language, makes threats, is severely hostile, or completely non-responsive (ghosting mid-conversation after initial engagement). Refuses to cooperate in any way. Makes meaningful conversation impossible. Immediate escalation or termination required. Example: F*** off, stop harassing me or complete silence after multiple attempts to engage.',
    },
  },
  examples: {
    rating5:
      "EXAMPLE A (Interested + Cooperative): USER: Hello! I'm Sarah, and I'm very interested in learning more about this data analyst position. I have 5 years of experience. Could you tell me more? [Enthusiastic, volunteers information] EXAMPLE B (NOT Interested + Cooperative): USER: Hi, thanks for reaching out. I appreciate the interest, but I'm quite content in my current role and not looking to make a change at this time. I hope you understand. [Declining but professional and graceful]",
    rating3:
      "USER: [Provides minimal one-word answers] Agent: 'Do you have Python experience?' User: 'Yes.' Agent: 'How many years?' User: 'Some.' [Neutral, not hostile but not helpful]",
    rating1: "USER: 'F*** off. Stop calling me. This is harassment.' [Hostile, abusive language]",
  },
};

export const CandidateResponseClarity: QualityAttributeDefinition = {
  name: 'Candidate Response Clarity',
  description:
    "Measures specificity and completeness of candidate answers. Independent of engagement level - a disinterested candidate can still give clear answers if they choose to respond. Assesses: (1) Specificity (numbers, names, examples vs. vague claims), (2) Directness (answers the question asked vs. tangential), (3) Evidence quality following standard levels: STRONG (detailed, specific, verifiable with context), MODERATE (some specifics lacking depth), WEAK (general statements lacking specifics), INSUFFICIENT (vague claims like 'I know it', 'I have experience'), (4) Consistency across responses. This dimension determines how much probing work the recruiter must perform - high clarity means efficient screening, low clarity requires extensive verification effort.",
  weight: 0.35,
  category: 'candidate',
  rating: {
    '5': {
      label: 'Highly Specific',
      description:
        'Candidate consistently provides STRONG evidence unprompted: specific numbers, names, technologies, examples with context. Answers are direct, complete, and address the question asked. Minimal probing needed. Example: "I have 7 years Python experience building REST APIs with Django at Google, handling 10M+ requests/day, recently migrated legacy system reducing latency by 60%."',
    },
    '4': {
      label: 'Specific',
      description:
        'Candidate provides MODERATE evidence: some specifics and examples, generally direct answers. May lack occasional depth or detail. Light probing may be needed for full verification. Example: "I have several years of Python experience in web development with Django and Flask frameworks."',
    },
    '3': {
      label: 'Adequate',
      description:
        'Candidate provides WEAK evidence: general statements lacking specifics, vague timeframes, no concrete examples. Answers are somewhat relevant but lack depth. Requires systematic probing to verify. Example: "I have experience with Python and have worked on various web development projects."',
    },
    '2': {
      label: 'Vague',
      description:
        'Candidate provides INSUFFICIENT evidence: ambiguous claims, no specifics, extremely broad statements. Answers lack substance. Requires extensive probing. Example: "I know Python pretty well" or "I\'ve used it before" or "I have experience with programming."',
    },
    '1': {
      label: 'Evasive',
      description:
        'Candidate actively avoids answering, gives contradictory responses, provides incoherent replies, or answers different questions than asked. Evidence gathering extremely difficult or impossible even with probing. Example: Q: "What SQL experience do you have?" A: "Well, I\'m a quick learner and databases are everywhere these days."',
    },
  },
  examples: {
    rating5:
      "Q: 'Tell me about your SQL experience' → A: 'I use SQL daily at TechCorp for 5 years. I write complex queries with CTEs, window functions, and optimize queries handling 50M+ rows. Recent project: built data pipeline reducing report generation time from 2 hours to 15 minutes using query optimization and indexing strategies.' [STRONG: specific years, technologies, metrics, context]",
    rating4:
      "Q: 'Tell me about your SQL experience' → A: 'I have about 5 years of SQL experience. I work with large datasets and write complex queries including joins and subqueries for reporting and analysis.' [MODERATE: specific duration, some technical detail, lacks concrete examples]",
    rating2:
      "Q: 'Tell me about your SQL experience' → A: 'Yeah, I know SQL. I use it sometimes.' [INSUFFICIENT: no timeframe, no specifics, vague claim]",
  },
};

export const CandidateProfessionalism: QualityAttributeDefinition = {
  name: 'Candidate Professionalism',
  description:
    'Assesses candidate conduct and tone, independent of interest level or response clarity. A disinterested candidate can still be professional; an engaged candidate can be unprofessional. Measures: (1) Courtesy and respect in language/tone, (2) Appropriate boundary setting (can decline politely vs. hostile rejection), (3) Professional language (no profanity, threats, abuse), (4) Reasonable communication (no excessive demands, accusations, or paranoia), (5) Responsiveness (timely replies vs. ghosting mid-conversation). This affects conversation viability - unprofessional candidates may trigger escalation or immediate termination regardless of qualifications.',
  weight: 0.2,
  category: 'candidate',
  rating: {
    '5': {
      label: 'Highly Professional',
      description:
        'Candidate is exceptionally courteous and respectful throughout, uses professional language, sets boundaries gracefully if needed. Even when declining or expressing concerns, remains polite and appreciative. Communicates clearly and responds promptly. Example: "I appreciate your interest, but I\'m quite content in my current role and not looking to make a change. I hope you understand. Thank you for reaching out."',
    },
    '4': {
      label: 'Professional',
      description:
        'Candidate is generally respectful and courteous. Professional language used. Minor edge to tone or slight directness when setting boundaries, but no concerning behavior. Professional enough to work with comfortably.',
    },
    '3': {
      label: 'Acceptable',
      description:
        'Candidate is neutral, somewhat transactional. May show skepticism, guardedness, or directness that borders on curt. No overt rudeness but lacks warmth. Workable but requires careful handling from recruiter to maintain rapport.',
    },
    '2': {
      label: 'Below Standard',
      description:
        'Candidate shows rudeness, excessive suspicion, or inappropriate behavior. May use aggressive tone, make unreasonable accusations (data breach claims without basis), be dismissive or condescending. No profanity but hostile undertone. Difficult and uncomfortable to work with.',
    },
    '1': {
      label: 'Unprofessional',
      description:
        'Candidate uses profanity, makes threats, is abusive or harassing, completely inappropriate. May include: explicit insults, violent language, discriminatory remarks, or severe hostility. Conversation should be escalated or terminated immediately. Example: "F*** off. How dare you call me. I\'ll report you for harassment and sue your company."',
    },
  },
  examples: {
    rating5:
      "USER: 'Thank you for reaching out. While I appreciate the opportunity, I need to respectfully decline as I'm committed to my current role and not exploring new positions at this time. I wish you success in finding the right candidate.'",
    rating3:
      "USER: 'I didn't give you permission to contact me. Where did you get my information? This better not be some data breach situation.'",
    rating1:
      "USER: 'What the f*** is this? Stop harassing me you spam piece of s***. I'm reporting your a** to the authorities.'",
  },
};
