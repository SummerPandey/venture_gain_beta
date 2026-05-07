import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

void main() {
  runApp(const MyApp());
}

const _cream = Color(0xFFF5E6D3);
const _paper = Color(0xFFFFFCF8);
const _brown = Color(0xFF6B4423);
const _border = Color(0xFF8B5A3E);
const _muted = Color(0xFFA0725A);
const _orange = Color(0xFFFF9F66);
const _peach = Color(0xFFFFB88A);
const _softPeach = Color(0xFFFFD4A8);
const _danger = Color(0xFFD32F2F);

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gamified Health Tracker',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: _cream,
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(seedColor: _orange),
      ),
      home: const HealthTrackerApp(),
    );
  }
}

class HealthTrackerApp extends StatefulWidget {
  const HealthTrackerApp({super.key});

  @override
  State<HealthTrackerApp> createState() => _HealthTrackerAppState();
}

class _HealthTrackerAppState extends State<HealthTrackerApp> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[
      const WorkoutPlusTab(),
      const FoodWaterTab(),
      const OverviewTab(),
      const SleepTab(),
      const LogTab(),
    ];

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        systemNavigationBarColor: Color(0xFFFFF5E6),
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        body: Stack(
          children: [
            const Positioned.fill(child: SunsetBackground()),
            SafeArea(
              bottom: false,
              child: Column(
                children: [
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 250),
                      child: pages[_tab],
                    ),
                  ),
                  BottomNav(
                    activeIndex: _tab,
                    onChanged: (index) => setState(() => _tab = index),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SunsetBackground extends StatelessWidget {
  const SunsetBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _SunsetPainter(),
      child: const SizedBox.expand(),
    );
  }
}

class _SunsetPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawColor(_cream, BlendMode.srcOver);
    _wave(canvas, size, 0.10, 0.05, const Color(0x99FFE5CC));
    _wave(canvas, size, 0.37, 0.32, const Color(0xB3FFDBB8));
    _wave(canvas, size, 0.75, 0.70, const Color(0xCCFFCFA3));

    final bottom = Path()
      ..moveTo(0, size.height * .90)
      ..quadraticBezierTo(size.width * .30, size.height * .84, size.width * .60, size.height * .90)
      ..quadraticBezierTo(size.width * .80, size.height * .94, size.width, size.height * .90)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(bottom, Paint()..color = const Color(0x80FFB88A));

    _paw(canvas, Offset(size.width * .14, size.height * .13), 1, .15);
    _paw(canvas, Offset(size.width * .82, size.height * .24), .82, .12);
  }

  void _wave(Canvas canvas, Size size, double y, double top, Color color) {
    final path = Path()
      ..moveTo(0, size.height * y)
      ..quadraticBezierTo(size.width * .25, size.height * (y - .05), size.width * .50, size.height * y)
      ..quadraticBezierTo(size.width * .75, size.height * (y + .05), size.width, size.height * y)
      ..lineTo(size.width, size.height * top)
      ..lineTo(0, size.height * top)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  void _paw(Canvas canvas, Offset c, double scale, double opacity) {
    final paint = Paint()..color = _border.withValues(alpha: opacity);
    void oval(double dx, double dy, double w, double h) {
      canvas.drawOval(Rect.fromCenter(center: c + Offset(dx, dy) * scale, width: w * scale, height: h * scale), paint);
    }

    oval(0, 8, 8, 10);
    oval(-6, -1, 5, 7);
    oval(0, -4, 5, 7);
    oval(6, -1, 5, 7);
    oval(0, -10, 4, 5);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class BottomNav extends StatelessWidget {
  const BottomNav({super.key, required this.activeIndex, required this.onChanged});

  final int activeIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final items = [
      (Icons.fitness_center, 'Workout'),
      (Icons.apple, 'Food'),
      (Icons.bar_chart_rounded, 'Overview'),
      (Icons.nightlight_round, 'Sleep'),
      (Icons.calendar_month, 'Log'),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
      decoration: BoxDecoration(
        color: const Color(0xF2FFF5E6),
        border: Border(top: BorderSide(color: _border.withValues(alpha: .20), width: 2)),
        boxShadow: [BoxShadow(color: _border.withValues(alpha: .10), blurRadius: 18, offset: const Offset(0, -5))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: List.generate(items.length, (index) {
          final active = activeIndex == index;
          return Tooltip(
            message: items[index].$2,
            child: InkResponse(
              onTap: () => onChanged(index),
              radius: 34,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                width: active ? 56 : 44,
                height: active ? 56 : 44,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: active ? const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
                  boxShadow: active
                      ? [
                          BoxShadow(color: _orange.withValues(alpha: .45), blurRadius: 16, offset: const Offset(0, 4)),
                          BoxShadow(color: _peach.withValues(alpha: .30), blurRadius: 24),
                        ]
                      : null,
                ),
                child: Icon(items[index].$1, color: active ? _brown : _border, size: active ? 28 : 24),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class PageShell extends StatelessWidget {
  const PageShell({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      key: ValueKey(title),
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 430),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, textAlign: TextAlign.center, style: monument(size: 16, color: _brown).copyWith(shadows: [Shadow(color: _peach.withValues(alpha: .35), blurRadius: 8, offset: const Offset(0, 2))])),
              const SizedBox(height: 24),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

class MonumentCard extends StatelessWidget {
  const MonumentCard({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.margin = const EdgeInsets.only(bottom: 24)});

  final Widget child;
  final EdgeInsets padding;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: _paper.withValues(alpha: .90),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _border, width: 3),
        boxShadow: [
          BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4)),
          BoxShadow(color: _peach.withValues(alpha: .12), blurRadius: 24, offset: const Offset(0, 8)),
        ],
      ),
      child: child,
    );
  }
}

class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.icon, this.badge, required this.onTap, this.size = 112});

  final IconData icon;
  final String? badge;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onTap,
            child: Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: _border, width: 3),
                boxShadow: [
                  BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4)),
                  BoxShadow(color: _orange.withValues(alpha: .20), blurRadius: 32, offset: const Offset(0, 8)),
                ],
              ),
              child: Icon(icon, color: _brown, size: 48),
            ),
          ),
          if (badge != null)
            Positioned(
              top: -10,
              right: -10,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: _paper.withValues(alpha: .92),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: _border, width: 2),
                  boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
                ),
                child: Text(badge!, style: monument(size: 9, color: _brown)),
              ),
            ),
        ],
      ),
    );
  }
}

class PixelBar extends StatelessWidget {
  const PixelBar({
    super.key,
    required this.label,
    required this.value,
    required this.max,
    this.target,
    this.limit,
    this.unit = '',
    this.color = _orange,
    this.icon,
  });

  final String label;
  final double value;
  final double max;
  final double? target;
  final double? limit;
  final String unit;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final percent = (value / max).clamp(0.0, 1.0);
    final targetPercent = target == null ? null : (target! / max).clamp(0.0, 1.0);
    final valueText = unit == 'L' ? value.toStringAsFixed(1) : value.round().toString();
    final targetText = target == null ? '' : ' / ${unit == 'L' ? target!.toStringAsFixed(1) : target!.round()}$unit';

    return Padding(
      padding: const EdgeInsets.only(bottom: 26),
      child: Column(
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Container(
                  width: 54,
                  height: 54,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _paper.withValues(alpha: .28),
                    border: Border.all(color: _border, width: 2),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
                const SizedBox(width: 18),
              ],
              Expanded(child: Text(label, style: monument(size: 11, color: _brown))),
              Text('$valueText$unit$targetText', style: monument(size: 10, color: _muted)),
            ],
          ),
          const SizedBox(height: 12),
          LayoutBuilder(
            builder: (context, constraints) {
              return UniformProgressTrack(
                progress: percent,
                color: color,
                targetPercent: targetPercent,
                width: constraints.maxWidth,
              );
            },
          ),
        ],
      ),
    );
  }
}

class WorkoutPlusTab extends StatefulWidget {
  const WorkoutPlusTab({super.key});

  @override
  State<WorkoutPlusTab> createState() => _WorkoutPlusTabState();
}

class _WorkoutPlusTabState extends State<WorkoutPlusTab> {
  double workout = 55;
  double energy = 75;
  bool scanned = false;
  _Exercise? selectedExercise;
  bool showExerciseSelection = false;
  bool viewingTodayWorkouts = false;
  String trackingMode = 'energy';
  int energyRating = 3;
  List<_WorkoutSet> sets = const [_WorkoutSet()];
  List<_LoggedWorkout> todayWorkouts = const [];

  static const exercises = [
    _Exercise('Bench Press', 84, 102, 82, Icons.fitness_center, 'kg'),
    _Exercise('Squats', 102, 125, 82, Icons.trending_up, 'kg'),
    _Exercise('Deadlift', 125, 143, 87, Icons.track_changes, 'kg'),
    _Exercise('Pull-ups', 12, 20, 60, Icons.emoji_events, 'reps'),
    _Exercise('Running', 3.5, 5, 70, Icons.directions_run, 'km'),
  ];

  static const history = {
    'Bench Press': [61.0, 66.0, 70.0, 75.0, 79.0, 84.0],
    'Squats': [75.0, 82.0, 88.0, 93.0, 98.0, 102.0],
    'Deadlift': [93.0, 102.0, 109.0, 116.0, 120.0, 125.0],
    'Pull-ups': [5.0, 7.0, 8.0, 10.0, 11.0, 12.0],
    'Running': [2.0, 2.3, 2.7, 3.0, 3.2, 3.5],
  };

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        PageShell(
          title: 'Workout & Energy',
          children: [
            GradientButton(
              icon: Icons.photo_camera_outlined,
              badge: 'AI SCAN',
              onTap: () => setState(() {
                workout = math.min(100, workout + 20);
                energy = math.max(0, energy - 10);
                scanned = true;
              }),
            ),
            const SizedBox(height: 24),
            if (scanned) const ScanCard(title: 'Gemini AI Scan', lines: ['+20 WORKOUT', '+15 CARDIO']),
            PixelBar(label: 'WORKOUT', value: workout, max: 100, color: _orange, icon: Icons.fitness_center),
            PixelBar(label: 'ENERGY', value: energy, max: 100, color: _peach, icon: Icons.bolt),
            MonumentCard(
              child: Column(
                children: [
                  Text('Workout Today', style: monument(size: 12, color: _brown)),
                  const SizedBox(height: 18),
                  if (todayWorkouts.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text('No workouts logged yet', style: monument(size: 10, color: _muted)),
                    )
                  else
                    ExerciseRow(
                      name: '${todayWorkouts.length} ${todayWorkouts.length == 1 ? 'Exercise' : 'Exercises'}',
                      current: 'View',
                      goal: 'Details',
                      progress: math.min(1, todayWorkouts.length / 5),
                      icon: Icons.fitness_center,
                      onTap: () => setState(() => viewingTodayWorkouts = true),
                    ),
                  const SizedBox(height: 4),
                  ModeButtonWide(label: '+ ADD EXERCISE', active: false, onTap: () => setState(() => showExerciseSelection = true)),
                ],
              ),
            ),
            MonumentCard(child: ChartBlock(title: 'Weekly Volume', chart: BarChartPainter(values: const [850, 920, 780, 1050, 890, 1100, 650], max: 1200, colors: const [_orange]))),
            MonumentCard(margin: EdgeInsets.zero, child: ChartBlock(title: 'Weekly Trends', chart: LineChartPainter(series: const [[45, 52, 48, 65, 58, 70, 75], [80, 75, 72, 68, 65, 70, 73]], colors: const [_orange, _peach], legends: const ['Workout', 'Energy'], yMax: 100))),
          ],
        ),
        if (selectedExercise != null)
          _WorkoutModal(
            exercise: selectedExercise!,
            trackingMode: trackingMode,
            energyRating: energyRating,
            sets: sets,
            history: history[selectedExercise!.name]!,
            onClose: _closeModal,
            onModeChanged: (mode) => setState(() => trackingMode = mode),
            onRatingChanged: (rating) => setState(() => energyRating = rating),
            onAddSet: () => setState(() => sets = [...sets, const _WorkoutSet()]),
            onSetChanged: (index, set) => setState(() {
              final next = [...sets];
              next[index] = set;
              sets = next;
            }),
            onLog: () => setState(() {
              final now = TimeOfDay.now();
              todayWorkouts = [
                ...todayWorkouts,
                _LoggedWorkout(
                  exercise: selectedExercise!.name,
                  type: trackingMode,
                  energyRating: trackingMode == 'energy' ? energyRating : null,
                  sets: trackingMode == 'weights' ? sets : null,
                  time: now.format(context),
                  unit: selectedExercise!.unit,
                ),
              ];
              workout = math.min(100, workout + 5);
              _closeModal();
            }),
          ),
        if (viewingTodayWorkouts)
          _TodayWorkoutsModal(
            workouts: todayWorkouts,
            onClose: () => setState(() => viewingTodayWorkouts = false),
          ),
        if (showExerciseSelection)
          _ExerciseSelectionModal(
            exercises: exercises,
            onClose: () => setState(() => showExerciseSelection = false),
            onSelect: (exercise) => setState(() {
              selectedExercise = exercise;
              showExerciseSelection = false;
            }),
          ),
      ],
    );
  }

  void _closeModal() {
    selectedExercise = null;
    trackingMode = 'energy';
    energyRating = 3;
    sets = const [_WorkoutSet()];
  }
}

class _Exercise {
  const _Exercise(this.name, this.current, this.goal, this.progress, this.icon, this.unit);

  final String name;
  final num current;
  final num goal;
  final double progress;
  final IconData icon;
  final String unit;
}

class _WorkoutSet {
  const _WorkoutSet({this.reps = 0, this.weight = 0});

  final int reps;
  final double weight;
}

class _LoggedWorkout {
  const _LoggedWorkout({
    required this.exercise,
    required this.type,
    required this.time,
    required this.unit,
    this.energyRating,
    this.sets,
  });

  final String exercise;
  final String type;
  final String time;
  final String unit;
  final int? energyRating;
  final List<_WorkoutSet>? sets;
}

class _WorkoutModal extends StatelessWidget {
  const _WorkoutModal({
    required this.exercise,
    required this.trackingMode,
    required this.energyRating,
    required this.sets,
    required this.history,
    required this.onClose,
    required this.onModeChanged,
    required this.onRatingChanged,
    required this.onAddSet,
    required this.onSetChanged,
    required this.onLog,
  });

  final _Exercise exercise;
  final String trackingMode;
  final int energyRating;
  final List<_WorkoutSet> sets;
  final List<double> history;
  final VoidCallback onClose;
  final ValueChanged<String> onModeChanged;
  final ValueChanged<int> onRatingChanged;
  final VoidCallback onAddSet;
  final void Function(int index, _WorkoutSet set) onSetChanged;
  final VoidCallback onLog;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: GestureDetector(
        onTap: onClose,
        child: Container(
          color: _brown.withValues(alpha: .70),
          padding: const EdgeInsets.all(18),
          child: Center(
            child: GestureDetector(
              onTap: () {},
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: MonumentCard(
                  margin: EdgeInsets.zero,
                  padding: const EdgeInsets.all(22),
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(exercise.name, style: monument(size: 13, color: _brown))),
                            SmallActionButton(icon: Icons.close, onTap: onClose),
                          ],
                        ),
                        const SizedBox(height: 18),
                        Row(
                          children: [
                            Expanded(child: _ModeButton(label: 'ENERGY ONLY', active: trackingMode == 'energy', onTap: () => onModeChanged('energy'))),
                            const SizedBox(width: 10),
                            Expanded(child: _ModeButton(label: 'WEIGHTS', active: trackingMode == 'weights', onTap: () => onModeChanged('weights'))),
                          ],
                        ),
                        const SizedBox(height: 18),
                        if (trackingMode == 'energy')
                          _EnergyRatingPicker(value: energyRating, onChanged: onRatingChanged)
                        else
                          _SetsEditor(
                            sets: sets,
                            unit: exercise.unit,
                            onAddSet: onAddSet,
                            onSetChanged: onSetChanged,
                          ),
                        const SizedBox(height: 16),
                        _PrimaryLogButton(onTap: onLog),
                        const SizedBox(height: 18),
                        SizedBox(
                          height: 220,
                          child: CustomPaint(
                            painter: LineChartPainter(
                              series: [history],
                              colors: const [_orange],
                              legends: const [''],
                              xLabels: const ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
                            ),
                            child: const SizedBox.expand(),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? null : _paper.withValues(alpha: .95),
          gradient: active ? const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _border, width: 2),
          boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
        ),
        child: Text(label, style: monument(size: 10, color: active ? _brown : _border)),
      ),
    );
  }
}

class _EnergyRatingPicker extends StatelessWidget {
  const _EnergyRatingPicker({required this.value, required this.onChanged});

  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('How did you feel? (1-5)', textAlign: TextAlign.center, style: monument(size: 10, color: _border)),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var rating = 1; rating <= 5; rating++) ...[
              _RatingButton(rating: rating, active: rating == value, onTap: () => onChanged(rating)),
              if (rating < 5) const SizedBox(width: 8),
            ],
          ],
        ),
      ],
    );
  }
}

class _RatingButton extends StatelessWidget {
  const _RatingButton({required this.rating, required this.active, required this.onTap});

  final int rating;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? null : _paper.withValues(alpha: .95),
          gradient: active ? const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _border, width: 2),
          boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
        ),
        child: Text('$rating', style: monument(size: 14, color: active ? _brown : _border)),
      ),
    );
  }
}

class _SetsEditor extends StatelessWidget {
  const _SetsEditor({required this.sets, required this.unit, required this.onAddSet, required this.onSetChanged});

  final List<_WorkoutSet> sets;
  final String unit;
  final VoidCallback onAddSet;
  final void Function(int index, _WorkoutSet set) onSetChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var index = 0; index < sets.length; index++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                SizedBox(width: 70, child: Text('SET ${index + 1}', style: monument(size: 9, color: _border))),
                Expanded(
                  child: _CompactNumberStepper(
                    label: 'REPS',
                    value: sets[index].reps.toDouble(),
                    onChanged: (value) => onSetChanged(index, _WorkoutSet(reps: value.round(), weight: sets[index].weight)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _CompactNumberStepper(
                    label: unit.toUpperCase(),
                    value: sets[index].weight,
                    onChanged: (value) => onSetChanged(index, _WorkoutSet(reps: sets[index].reps, weight: value)),
                  ),
                ),
              ],
            ),
          ),
        _ModeButton(label: '+ ADD SET', active: false, onTap: onAddSet),
      ],
    );
  }
}

class _CompactNumberStepper extends StatelessWidget {
  const _CompactNumberStepper({required this.label, required this.value, required this.onChanged});

  final String label;
  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: monument(size: 9, color: _border)),
        const SizedBox(height: 5),
        Container(
          height: 34,
          decoration: BoxDecoration(
            color: _paper.withValues(alpha: .95),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _border, width: 2),
            boxShadow: [BoxShadow(color: _border.withValues(alpha: .20), offset: const Offset(0, 3))],
          ),
          child: Row(
            children: [
              Expanded(child: InkResponse(onTap: () => onChanged(math.max(0, value - 1)), child: const Icon(Icons.remove, size: 16, color: _brown))),
              Text(value == value.roundToDouble() ? '${value.round()}' : value.toStringAsFixed(1), style: monument(size: 12, color: _brown)),
              Expanded(child: InkResponse(onTap: () => onChanged(value + 1), child: const Icon(Icons.add, size: 16, color: _brown))),
            ],
          ),
        ),
      ],
    );
  }
}

class _PrimaryLogButton extends StatelessWidget {
  const _PrimaryLogButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border, width: 3),
          boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
        ),
        child: Text('LOG WORKOUT', style: monument(size: 11, color: _brown)),
      ),
    );
  }
}

class _TodayWorkoutsModal extends StatelessWidget {
  const _TodayWorkoutsModal({required this.workouts, required this.onClose});

  final List<_LoggedWorkout> workouts;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return BasicOverlay(
      onClose: onClose,
      child: MonumentCard(
        margin: EdgeInsets.zero,
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ModalHeader(title: "Today's Workouts", onClose: onClose),
            const SizedBox(height: 14),
            for (final workout in workouts)
              MonumentCard(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(child: Text(workout.exercise, style: monument(size: 11, color: _brown))),
                      Text(workout.time, style: monument(size: 9, color: _muted)),
                    ]),
                    const SizedBox(height: 8),
                    if (workout.type == 'energy')
                      Text('Energy: ${workout.energyRating}/5', style: monument(size: 10, color: _border))
                    else
                      for (var i = 0; i < (workout.sets ?? const <_WorkoutSet>[]).length; i++)
                        Text('Set ${i + 1}: ${workout.sets![i].reps} reps x ${_formatNumber(workout.sets![i].weight)} ${workout.unit}', style: monument(size: 10, color: _border)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ExerciseSelectionModal extends StatelessWidget {
  const _ExerciseSelectionModal({required this.exercises, required this.onSelect, required this.onClose});

  final List<_Exercise> exercises;
  final ValueChanged<_Exercise> onSelect;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return BasicOverlay(
      onClose: onClose,
      child: MonumentCard(
        margin: EdgeInsets.zero,
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ModalHeader(title: 'Select Exercise', onClose: onClose),
            const SizedBox(height: 14),
            for (final exercise in exercises)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => onSelect(exercise),
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _paper.withValues(alpha: .95),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: _border, width: 2),
                      boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
                    ),
                    child: Row(children: [
                      Icon(exercise.icon, color: _orange, size: 18),
                      const SizedBox(width: 12),
                      Text(exercise.name, style: monument(size: 11, color: _brown)),
                    ]),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class BasicOverlay extends StatelessWidget {
  const BasicOverlay({super.key, required this.child, required this.onClose});

  final Widget child;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: GestureDetector(
        onTap: onClose,
        child: Container(
          color: _brown.withValues(alpha: .70),
          padding: const EdgeInsets.all(18),
          child: Center(
            child: GestureDetector(
              onTap: () {},
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430, maxHeight: 650),
                child: SingleChildScrollView(child: child),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ModalHeader extends StatelessWidget {
  const ModalHeader({super.key, required this.title, required this.onClose});

  final String title;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(child: Text(title, style: monument(size: 13, color: _brown))),
      SmallActionButton(icon: Icons.close, onTap: onClose),
    ]);
  }
}

class ModeButtonWide extends StatelessWidget {
  const ModeButtonWide({super.key, required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? null : _paper.withValues(alpha: .95),
          gradient: active ? const LinearGradient(colors: [_orange, _peach]) : null,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: _border, width: 2),
          boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
        ),
        child: Text(label, style: monument(size: 10, color: active ? _brown : _border)),
      ),
    );
  }
}

class FoodWaterTab extends StatefulWidget {
  const FoodWaterTab({super.key});

  @override
  State<FoodWaterTab> createState() => _FoodWaterTabState();
}

class _FoodWaterTabState extends State<FoodWaterTab> {
  double water = 0;
  double calories = 0;
  double protein = 0;
  double sugar = 0;
  bool scanned = false;

  @override
  Widget build(BuildContext context) {
    return PageShell(
      title: 'Food & Water',
      children: [
        GradientButton(
          icon: Icons.photo_camera_outlined,
          badge: 'SCAN',
          onTap: () => setState(() {
            water = math.min(6, water + 1);
            calories = math.min(4000, calories + 300);
            protein = math.min(300, protein + 30);
            sugar = math.min(100, sugar + 10);
            scanned = true;
          }),
        ),
        const SizedBox(height: 24),
        if (scanned) const ScanCard(title: 'AI Scan Results', lines: ['+300 CALORIES', '+30g PROTEIN', '+1L WATER', '+10g SUGAR']),
        MetricCard(
          title: 'Water Intake',
          icon: Icons.water_drop,
          label: 'Liters (0-6L)',
          value: water,
          max: 6,
          target: 3,
          unit: 'L',
          limit: 4,
          color: water > 4 ? _danger : _orange,
          step: 1,
          onChanged: (v) => setState(() => water = v.clamp(0, 6)),
        ),
        MetricCard(
          title: 'Calories',
          icon: Icons.local_fire_department,
          label: 'Calories (0-4000)',
          value: calories,
          max: 4000,
          target: 2500,
          limit: 3500,
          color: calories > 3500 ? _danger : _peach,
          step: 100,
          onChanged: (v) => setState(() => calories = v.clamp(0, 4000)),
        ),
        MetricCard(
          title: 'Protein',
          icon: Icons.restaurant,
          label: 'Grams (0-300g)',
          value: protein,
          max: 300,
          target: 170,
          limit: 250,
          unit: 'g',
          color: protein > 250 ? _danger : _softPeach,
          step: 10,
          onChanged: (v) => setState(() => protein = v.clamp(0, 300)),
        ),
        MetricCard(
          title: 'Sugar',
          icon: Icons.cookie,
          label: 'Grams (0-100g)',
          value: sugar,
          max: 100,
          target: 30,
          limit: 30,
          unit: 'g',
          color: sugar > 30 ? _danger : const Color(0xFFFFCAA0),
          step: 5,
          onChanged: (v) => setState(() => sugar = v.clamp(0, 100)),
        ),
      ],
    );
  }
}

class OverviewTab extends StatefulWidget {
  const OverviewTab({super.key});

  @override
  State<OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<OverviewTab> {
  int streak = 0;
  String? selectedCategory;

  static const categories = [
    _ExerciseCategory('Cardio', 'Running', 4, 5, 80, Icons.directions_run, ['Running', 'Jogging', 'Cycling', 'Swimming', 'Rowing', 'Jump Rope', 'Walking', 'Hiking']),
    _ExerciseCategory('Upper Body', 'Bench Press', 84, 102, 82, Icons.fitness_center, ['Bench Press', 'Incline Bench Press', 'Dumbbell Press', 'Push-ups', 'Pull-ups', 'Rows', 'Shoulder Press', 'Bicep Curls']),
    _ExerciseCategory('Lower Body', 'Squats', 102, 125, 82, Icons.trending_up, ['Squats', 'Front Squats', 'Leg Press', 'Lunges', 'Deadlift', 'Hip Thrusts', 'Calf Raises', 'Box Jumps']),
    _ExerciseCategory('Sprinting', 'Sprint Intervals', 12, 20, 60, Icons.track_changes, ['Sprint Intervals', '100m Sprints', 'Hill Sprints', 'Shuttle Runs', 'Tempo Runs', 'Sled Push', 'Track Sprints']),
  ];

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        PageShell(
          title: 'Overview',
          children: [
            Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SmallActionButton(icon: Icons.remove, onTap: () => setState(() => streak = math.max(0, streak - 1))),
            const SizedBox(width: 14),
            MonumentCard(
              margin: EdgeInsets.zero,
              padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 18),
              child: Column(children: [
                Text('STREAK', style: monument(size: 10, color: _brown)),
                Text('$streak', style: monument(size: 32, color: _orange, weight: FontWeight.w800)),
                Text('DAYS', style: monument(size: 10, color: _muted)),
              ]),
            ),
            const SizedBox(width: 14),
            SmallActionButton(icon: Icons.add, onTap: () => setState(() => streak++)),
          ],
        ),
        const SizedBox(height: 32),
        Center(
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.bottomCenter,
            children: [
              Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: _border, width: 3),
                  boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
                ),
                child: const CustomPaint(painter: CatCompanionPainter(), child: SizedBox.expand()),
              ),
              Positioned(
                bottom: -18,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                  decoration: BoxDecoration(color: _paper.withValues(alpha: .92), borderRadius: BorderRadius.circular(12), border: Border.all(color: _border, width: 2)),
                  child: Text('COMPANION', style: monument(size: 10, color: _brown)),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 44),
            MonumentCard(child: ChartBlock(title: 'Stats', chart: RadarPainter(labels: const ['FOOD', 'WATER', 'SLEEP', 'WORKOUT', 'ENERGY'], values: const [65, 80, 70, 55, 75]))),
            MonumentCard(
              margin: EdgeInsets.zero,
              child: Column(
                children: [
                  Text('Exercise Progress', style: monument(size: 12, color: _brown)),
                  const SizedBox(height: 18),
                  for (final item in categories)
                    ExerciseRow(
                      name: item.exercise,
                      current: item.current,
                      goal: item.goal,
                      progress: item.progress / 100,
                      icon: item.icon,
                      onTap: () => setState(() => selectedCategory = item.category),
                    ),
                ],
              ),
            ),
          ],
        ),
        if (selectedCategory != null)
          _ExerciseCategoryModal(
            category: categories.firstWhere((item) => item.category == selectedCategory),
            onClose: () => setState(() => selectedCategory = null),
          ),
      ],
    );
  }
}

class _ExerciseCategory {
  const _ExerciseCategory(this.category, this.exercise, this.current, this.goal, this.progress, this.icon, this.exercises);

  final String category;
  final String exercise;
  final Object current;
  final Object goal;
  final double progress;
  final IconData icon;
  final List<String> exercises;
}

class _ExerciseCategoryModal extends StatelessWidget {
  const _ExerciseCategoryModal({required this.category, required this.onClose});

  final _ExerciseCategory category;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return BasicOverlay(
      onClose: onClose,
      child: MonumentCard(
        margin: EdgeInsets.zero,
        padding: const EdgeInsets.all(22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ModalHeader(title: '${category.category} Exercises', onClose: onClose),
            const SizedBox(height: 14),
            for (final exercise in category.exercises)
              MonumentCard(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                child: Text(exercise, style: monument(size: 11, color: _border)),
              ),
          ],
        ),
      ),
    );
  }
}

class CatCompanionPainter extends CustomPainter {
  const CatCompanionPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final s = math.min(size.width, size.height);
    final c = Offset(size.width / 2, size.height / 2);
    final border = Paint()..color = _border..style = PaintingStyle.stroke..strokeWidth = 3;
    final fill = Paint()..color = const Color(0xFFFFCFA3);
    final ear = Paint()..color = _peach;
    canvas.drawPath(Path()..moveTo(c.dx - s * .23, c.dy - s * .14)..lineTo(c.dx - s * .36, c.dy - s * .36)..lineTo(c.dx - s * .10, c.dy - s * .23)..close(), ear);
    canvas.drawPath(Path()..moveTo(c.dx + s * .23, c.dy - s * .14)..lineTo(c.dx + s * .36, c.dy - s * .36)..lineTo(c.dx + s * .10, c.dy - s * .23)..close(), ear);
    canvas.drawOval(Rect.fromCenter(center: c, width: s * .58, height: s * .62), fill);
    canvas.drawOval(Rect.fromCenter(center: c, width: s * .58, height: s * .62), border);
    final eye = Paint()..color = _brown;
    canvas.drawOval(Rect.fromCenter(center: c + Offset(-s * .10, -s * .02), width: s * .05, height: s * .08), eye);
    canvas.drawOval(Rect.fromCenter(center: c + Offset(s * .10, -s * .02), width: s * .05, height: s * .08), eye);
    canvas.drawCircle(c + Offset(0, s * .06), s * .035, Paint()..color = _orange);
    final mouth = Paint()..color = _border..style = PaintingStyle.stroke..strokeWidth = 2..strokeCap = StrokeCap.round;
    canvas.drawArc(Rect.fromCenter(center: c + Offset(-s * .04, s * .10), width: s * .10, height: s * .08), 0, math.pi * .8, false, mouth);
    canvas.drawArc(Rect.fromCenter(center: c + Offset(s * .04, s * .10), width: s * .10, height: s * .08), math.pi * .2, math.pi * .8, false, mouth);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class SleepTab extends StatefulWidget {
  const SleepTab({super.key});

  @override
  State<SleepTab> createState() => _SleepTabState();
}

class LogTab extends StatefulWidget {
  const LogTab({super.key});

  @override
  State<LogTab> createState() => _LogTabState();
}

class _LogTabState extends State<LogTab> {
  bool summary = false;
  String category = 'WORKOUTS';
  String period = 'DAILY';
  int? selectedDay;

  static const categoryIcons = {
    'WORKOUTS': Icons.fitness_center,
    'HYDRATION': Icons.water_drop,
    'SLEEP': Icons.nightlight_round,
    'ENERGY': Icons.bolt,
  };

  static const insights = {
    'WORKOUTS': ['Completed 3 planned exercises today', 'Morning workout showed the best energy', 'Bench press increased from last week'],
    'HYDRATION': ['Consumed 3.2L out of a 3.5L target', 'Peak intake times were 10 AM and 2 PM', 'Hydration helped workout performance'],
    'SLEEP': ['7.5 hours of sleep logged', 'Deep sleep quality is trending upward', 'Bedtime consistency improved this week'],
    'ENERGY': ['Energy peaked around 11 AM', 'Post-workout boost lasted 3 hours', 'Afternoon energy improved with hydration'],
  };

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final monthName = _monthName(now.month);
    return Stack(
      children: [
        PageShell(
          title: 'Activity Log',
          children: [
            Row(children: [
              Expanded(child: ModeButtonWide(label: 'DAILY LOG', active: !summary, onTap: () => setState(() => summary = false))),
              const SizedBox(width: 10),
              Expanded(child: ModeButtonWide(label: 'SUMMARY', active: summary, onTap: () => setState(() => summary = true))),
            ]),
            const SizedBox(height: 18),
            if (!summary) ...[
              MonumentCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    SmallActionButton(icon: Icons.chevron_left, onTap: () {}),
                    Text('$monthName ${now.year}', style: monument(size: 12, color: _brown)),
                    SmallActionButton(icon: Icons.chevron_right, onTap: () {}),
                  ],
                ),
              ),
              for (var day = DateTime(now.year, now.month + 1, 0).day; day >= math.max(1, DateTime(now.year, now.month + 1, 0).day - 12); day--)
                LogDayRow(
                  month: monthName.substring(0, 3),
                  day: day,
                  isToday: day == now.day,
                  hasData: day == 15 || day == 20 || day == now.day,
                  onTap: () => setState(() => selectedDay = day),
                ),
            ] else ...[
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final item in categoryIcons.entries)
                    SizedBox(
                      width: 180,
                      child: ModeButtonWide(label: item.key, active: category == item.key, onTap: () => setState(() => category = item.key)),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Row(children: [
                for (final item in const ['DAILY', 'WEEKLY', 'MONTHLY']) ...[
                  Expanded(child: ModeButtonWide(label: item, active: period == item, onTap: () => setState(() => period = item))),
                  if (item != 'MONTHLY') const SizedBox(width: 8),
                ],
              ]),
              const SizedBox(height: 18),
              MonumentCard(
                padding: const EdgeInsets.all(24),
                child: Column(children: [
                  Text('$category - $period', style: monument(size: 11, color: _border)),
                  const SizedBox(height: 8),
                  Text('${_summaryScore(category, period)}%', style: monument(size: 48, color: _orange, weight: FontWeight.w800)),
                  UniformProgressTrack(progress: _summaryScore(category, period) / 100, color: _orange),
                ]),
              ),
              MonumentCard(
                margin: EdgeInsets.zero,
                child: Column(children: [
                  Text('AI INSIGHTS', style: monument(size: 12, color: _brown)),
                  const SizedBox(height: 14),
                  for (final insight in insights[category]!)
                    MonumentCard(
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(12),
                      child: Text('• $insight', style: monument(size: 10, color: _border).copyWith(height: 1.45)),
                    ),
                ]),
              ),
            ],
          ],
        ),
        if (selectedDay != null)
          BasicOverlay(
            onClose: () => setState(() => selectedDay = null),
            child: MonumentCard(
              margin: EdgeInsets.zero,
              padding: const EdgeInsets.all(22),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ModalHeader(title: '$monthName $selectedDay, ${now.year}', onClose: () => setState(() => selectedDay = null)),
                  const SizedBox(height: 14),
                  Text('WORKOUTS', style: monument(size: 11, color: _brown)),
                  const SizedBox(height: 10),
                  Text('Bench Press: 10 reps x 84 kg\nSquats: 12 reps x 102 kg', style: monument(size: 10, color: _border).copyWith(height: 1.6)),
                  const SizedBox(height: 14),
                  Text('Sleep 7.5h  •  Energy 8/10\nWater 2.8L  •  Calories 2100', style: monument(size: 10, color: _muted).copyWith(height: 1.6)),
                ],
              ),
            ),
          ),
      ],
    );
  }

  int _summaryScore(String category, String period) {
    final base = {'WORKOUTS': 85, 'HYDRATION': 92, 'SLEEP': 87, 'ENERGY': 79}[category]!;
    return period == 'DAILY' ? base : period == 'WEEKLY' ? base - 5 : base - 8;
  }

  String _monthName(int month) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  }
}

class LogDayRow extends StatelessWidget {
  const LogDayRow({super.key, required this.month, required this.day, required this.isToday, required this.hasData, required this.onTap});

  final String month;
  final int day;
  final bool isToday;
  final bool hasData;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return MonumentCard(
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: hasData ? onTap : null,
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('$month $day', style: monument(size: 14, color: _brown)),
              Text(isToday ? 'Today' : 'Activity day', style: monument(size: 9, color: _muted)),
            ]),
          ),
          if (hasData)
            Text(isToday ? 'TODAY' : '2 WORKOUTS', style: monument(size: 9, color: _border))
          else
            Text('No activity', style: monument(size: 9, color: _muted)),
        ]),
      ),
    );
  }
}

class _SleepTabState extends State<SleepTab> {
  double hours = 0;
  double minutes = 0;
  double energy = 0;

  @override
  Widget build(BuildContext context) {
    final total = hours + minutes / 60;
    return PageShell(
      title: 'Sleep & Energy',
      children: [
        MonumentCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SectionTitle(icon: Icons.nightlight_round, title: 'Sleep Duration', color: _orange),
              Row(
                children: [
                  Expanded(child: NumberField(label: 'Hours', value: hours, min: 0, max: 10, onChanged: (v) => setState(() => hours = v.clamp(0, 10)))),
                  const SizedBox(width: 12),
                  Expanded(child: NumberField(label: 'Minutes', value: minutes, min: 0, max: 59, step: 15, onChanged: (v) => setState(() => minutes = v.clamp(0, 59)))),
                ],
              ),
              const SizedBox(height: 18),
              PixelBar(label: 'SLEEP', value: total, max: 10, color: _orange, icon: Icons.nightlight_round),
            ],
          ),
        ),
        MetricCard(
          title: 'Energy Level',
          icon: Icons.bolt,
          label: 'Rate 0-10',
          value: energy,
          max: 10,
          color: _peach,
          onChanged: (v) => setState(() => energy = v.clamp(0, 10)),
        ),
        MonumentCard(margin: EdgeInsets.zero, child: ChartBlock(title: 'Weekly Overview', chart: BarChartPainter(values: const [65, 72, 68, 75, 70, 80, 78], secondaryValues: const [70, 68, 75, 80, 75, 85, 72], max: 100, colors: const [_orange, _peach]))),
      ],
    );
  }
}

class MetricCard extends StatelessWidget {
  const MetricCard({
    super.key,
    required this.title,
    required this.icon,
    required this.label,
    required this.value,
    required this.max,
    required this.color,
    required this.onChanged,
    this.target,
    this.limit,
    this.unit = '',
    this.step = 1,
  });

  final String title;
  final IconData icon;
  final String label;
  final double value;
  final double max;
  final Color color;
  final ValueChanged<double> onChanged;
  final double? target;
  final double? limit;
  final String unit;
  final double step;

  @override
  Widget build(BuildContext context) {
    return MonumentCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SectionTitle(icon: icon, title: title, color: color),
          NumberField(label: label, value: value, min: 0, max: max, step: step, onChanged: onChanged),
          const SizedBox(height: 18),
          PixelBar(label: title.split(' ').first.toUpperCase(), value: value, max: max, target: target, unit: unit, color: color, icon: icon),
          if (limit != null && value > limit!) ...[
            const SizedBox(height: 10),
            LimitWarning(label: '${title.split(' ').first.toUpperCase()} LIMIT EXCEEDED'),
          ],
        ],
      ),
    );
  }
}

class LimitWarning extends StatelessWidget {
  const LimitWarning({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: _danger.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _danger.withValues(alpha: .35), width: 2),
      ),
      child: Text(label, textAlign: TextAlign.center, style: monument(size: 9, color: _danger)),
    );
  }
}

class NumberField extends StatelessWidget {
  const NumberField({super.key, required this.label, required this.value, required this.min, required this.max, required this.onChanged, this.step = 1});

  final String label;
  final double value;
  final double min;
  final double max;
  final double step;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: monument(size: 10, color: _border)),
        const SizedBox(height: 8),
        Row(
          children: [
            SmallStepper(icon: Icons.remove, onTap: () => onChanged((value - step).clamp(min, max))),
            Expanded(
              child: Container(
                height: 42,
                alignment: Alignment.center,
                margin: const EdgeInsets.symmetric(horizontal: 8),
                decoration: BoxDecoration(
                  color: _paper.withValues(alpha: .95),
                  border: Border.all(color: _border, width: 2),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
                ),
                child: Text(step < 1 ? value.toStringAsFixed(1) : value.round().toString(), style: monument(size: 14, color: _brown)),
              ),
            ),
            SmallStepper(icon: Icons.add, onTap: () => onChanged((value + step).clamp(min, max))),
          ],
        ),
      ],
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.icon, required this.title, required this.color});

  final IconData icon;
  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Text(title, style: monument(size: 12, color: _brown)),
      ]),
    );
  }
}

class ScanCard extends StatelessWidget {
  const ScanCard({super.key, required this.title, required this.lines});

  final String title;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return MonumentCard(
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        Text(title, style: monument(size: 12, color: _brown)),
        const SizedBox(height: 12),
        for (final line in lines) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(line, style: monument(size: 11, color: _orange))),
      ]),
    );
  }
}

class ExerciseRow extends StatelessWidget {
  const ExerciseRow({
    super.key,
    required this.name,
    required this.current,
    required this.goal,
    required this.progress,
    required this.icon,
    this.onTap,
  });

  final String name;
  final Object current;
  final Object goal;
  final double progress;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 22),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 54,
              height: 54,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: _paper.withValues(alpha: .45), border: Border.all(color: _border, width: 2), borderRadius: BorderRadius.circular(14)),
              child: Icon(icon, color: _orange, size: 24),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Column(children: [
                Row(children: [
                  Expanded(child: Text(name, style: monument(size: 11, color: _border))),
                  Text('$current / $goal', style: monument(size: 10, color: _muted)),
                ]),
                const SizedBox(height: 14),
                PixelMiniBar(progress: progress),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class PixelMiniBar extends StatelessWidget {
  const PixelMiniBar({super.key, required this.progress});

  final double progress;

  @override
  Widget build(BuildContext context) {
    return UniformProgressTrack(progress: progress, color: _orange);
  }
}

class UniformProgressTrack extends StatelessWidget {
  const UniformProgressTrack({
    super.key,
    required this.progress,
    required this.color,
    this.targetPercent,
    this.width,
  });

  final double progress;
  final Color color;
  final double? targetPercent;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 16,
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        color: _paper.withValues(alpha: .32),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _border, width: 2),
      ),
      child: Stack(
        children: [
          FractionallySizedBox(
            widthFactor: progress.clamp(0.0, 1.0),
            child: Container(
              margin: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [color, color == _softPeach ? const Color(0xFFFFCAA0) : _peach]),
                borderRadius: BorderRadius.circular(7),
              ),
            ),
          ),
          if (targetPercent != null && width != null)
            Positioned(
              left: width! * targetPercent!.clamp(0.0, 1.0) - 1,
              top: 2,
              bottom: 2,
              child: Container(width: 2, color: _border.withValues(alpha: .30)),
            ),
        ],
      ),
    );
  }
}

class SmallActionButton extends StatelessWidget {
  const SmallActionButton({super.key, required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [_orange, _peach], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _border, width: 3),
          boxShadow: [BoxShadow(color: _border.withValues(alpha: .25), offset: const Offset(0, 4))],
        ),
        child: Icon(icon, color: _brown, size: 22),
      ),
    );
  }
}

class SmallStepper extends StatelessWidget {
  const SmallStepper({super.key, required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 18,
      child: Icon(icon, color: _brown, size: 20),
    );
  }
}

class ChartBlock extends StatelessWidget {
  const ChartBlock({super.key, required this.title, required this.chart});

  final String title;
  final CustomPainter chart;

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Text(title, style: monument(size: 12, color: _brown)),
      const SizedBox(height: 14),
      SizedBox(height: 210, child: CustomPaint(painter: chart, child: const SizedBox.expand())),
    ]);
  }
}

class BarChartPainter extends CustomPainter {
  BarChartPainter({required this.values, required this.max, required this.colors, this.secondaryValues});

  final List<double> values;
  final List<double>? secondaryValues;
  final double max;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final chart = Rect.fromLTWH(30, 8, size.width - 38, size.height - 36);
    final grid = Paint()..color = _muted.withValues(alpha: .20)..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = chart.top + chart.height * i / 4;
      canvas.drawLine(Offset(chart.left, y), Offset(chart.right, y), grid);
    }
    final days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    final count = values.length;
    final slot = chart.width / count;
    final hasSecond = secondaryValues != null;
    for (var i = 0; i < count; i++) {
      final groupWidth = hasSecond ? slot * .55 : slot * .45;
      final barWidth = hasSecond ? groupWidth / 2 - 2 : groupWidth;
      final baseX = chart.left + slot * i + (slot - groupWidth) / 2;
      _bar(canvas, chart, baseX, barWidth, values[i] / max, colors[0]);
      if (hasSecond) _bar(canvas, chart, baseX + barWidth + 4, barWidth, secondaryValues![i] / max, colors[1]);
      _label(canvas, days[i], Offset(chart.left + slot * i + slot / 2, size.height - 15), 10, _muted, TextAlign.center);
    }
  }

  void _bar(Canvas canvas, Rect chart, double x, double w, double percent, Color color) {
    final h = chart.height * percent.clamp(0, 1);
    final rect = RRect.fromRectAndCorners(Rect.fromLTWH(x, chart.bottom - h, w, h), topLeft: const Radius.circular(8), topRight: const Radius.circular(8));
    canvas.drawRRect(rect, Paint()..color = color);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class LineChartPainter extends CustomPainter {
  LineChartPainter({required this.series, required this.colors, required this.legends, this.xLabels, this.yMax});

  final List<List<double>> series;
  final List<Color> colors;
  final List<String> legends;
  final List<String>? xLabels;
  final double? yMax;

  @override
  void paint(Canvas canvas, Size size) {
    final chart = Rect.fromLTWH(30, 8, size.width - 38, size.height - 50);
    final grid = Paint()..color = _muted.withValues(alpha: .20)..strokeWidth = 1;
    final allValues = series.expand((values) => values);
    final maxValue = yMax ?? allValues.reduce(math.max);
    for (var i = 0; i <= 4; i++) {
      final y = chart.top + chart.height * i / 4;
      canvas.drawLine(Offset(chart.left, y), Offset(chart.right, y), grid);
    }
    final labels = xLabels ?? const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (var i = 0; i < labels.length; i++) {
      final x = labels.length == 1 ? chart.center.dx : chart.left + chart.width * i / (labels.length - 1);
      _label(canvas, labels[i], Offset(x, chart.bottom + 14), 10, _muted, TextAlign.center);
    }
    for (var s = 0; s < series.length; s++) {
      final path = Path();
      for (var i = 0; i < series[s].length; i++) {
        final x = series[s].length == 1 ? chart.center.dx : chart.left + chart.width * i / (series[s].length - 1);
        final point = Offset(x, chart.bottom - chart.height * (series[s][i] / maxValue));
        if (i == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
        canvas.drawCircle(point, 4, Paint()..color = colors[s]);
      }
      canvas.drawPath(path, Paint()..color = colors[s]..strokeWidth = 3..style = PaintingStyle.stroke..strokeCap = StrokeCap.round);
      if (legends[s].isNotEmpty) {
        _label(canvas, legends[s], Offset(chart.left + s * 78, size.height - 10), 11, colors[s], TextAlign.left);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class RadarPainter extends CustomPainter {
  RadarPainter({required this.labels, required this.values});

  final List<String> labels;
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2 + 8);
    final radius = math.min(size.width, size.height) * .34;
    final gridPaint = Paint()..color = _muted.withValues(alpha: .25)..style = PaintingStyle.stroke;
    for (var ring = 1; ring <= 4; ring++) {
      canvas.drawPath(_polygon(center, radius * ring / 4, List.filled(labels.length, 1)), gridPaint);
    }
    for (var i = 0; i < labels.length; i++) {
      final angle = -math.pi / 2 + i * math.pi * 2 / labels.length;
      final outer = center + Offset(math.cos(angle), math.sin(angle)) * radius;
      canvas.drawLine(center, outer, gridPaint);
      _label(canvas, labels[i], center + Offset(math.cos(angle), math.sin(angle)) * (radius + 22), 10, _muted, TextAlign.center);
    }
    final filled = _polygon(center, radius, values.map((v) => v / 100).toList());
    canvas.drawPath(filled, Paint()..color = _orange.withValues(alpha: .40));
    canvas.drawPath(filled, Paint()..color = _orange..style = PaintingStyle.stroke..strokeWidth = 2);
  }

  Path _polygon(Offset center, double radius, List<double> values) {
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final angle = -math.pi / 2 + i * math.pi * 2 / values.length;
      final point = center + Offset(math.cos(angle), math.sin(angle)) * radius * values[i];
      if (i == 0) {
        path.moveTo(point.dx, point.dy);
      } else {
        path.lineTo(point.dx, point.dy);
      }
    }
    return path..close();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

void _label(Canvas canvas, String text, Offset offset, double size, Color color, TextAlign align) {
  final painter = TextPainter(
    text: TextSpan(text: text, style: TextStyle(color: color, fontSize: size, fontWeight: FontWeight.w700)),
    textAlign: align,
    textDirection: TextDirection.ltr,
  )..layout(maxWidth: 80);
  painter.paint(canvas, offset - Offset(align == TextAlign.center ? painter.width / 2 : 0, painter.height / 2));
}

String _formatNumber(num value) {
  return value == value.roundToDouble() ? value.round().toString() : value.toStringAsFixed(1);
}

TextStyle monument({required double size, required Color color, FontWeight weight = FontWeight.w700}) {
  return TextStyle(
    color: color,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: .8,
    height: 1.2,
  );
}
