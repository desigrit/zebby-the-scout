"""Rebuild the report figures from public aggregate data. No model calls."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / 'results.json').read_text(encoding='utf-8'))
ROWS = DATA['configurations']
BG, INK, MUTED, GRID = '#faf8f5', '#302e2b', '#746d66', '#e5dfd8'
EMBER, GREEN, AMBER, GREY = '#a94a32', '#3f6d60', '#b17b28', '#e2ddd6'
plt.rcParams.update({
    'font.family': 'DejaVu Sans', 'font.size': 11, 'text.color': INK,
    'axes.labelcolor': MUTED, 'xtick.color': MUTED, 'ytick.color': INK,
    'figure.facecolor': BG, 'axes.facecolor': BG, 'savefig.facecolor': BG,
    'svg.fonttype': 'path', 'svg.hashsalt': 'zebby-evaluation-2026-11',
})

def get(provider, model, thinking):
    return next(r for r in ROWS if (r['provider'], r['model_id'], r['thinking']) == (provider, model, thinking))

def heading(fig, title, subtitle):
    fig.text(.045, .962, 'ZEBBY  /  MODEL EVALUATION', fontsize=10, color=EMBER, weight='bold')
    fig.text(.955, .962, '6 NOV 2026', fontsize=10, color=MUTED, ha='right')
    fig.text(.045, .909, title, fontsize=24, weight='bold')
    fig.text(.045, .871, subtitle, fontsize=11.5, color=MUTED)

def save(fig, name):
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    # Check every visible text label stays within the exported canvas.
    for t in fig.findobj(matplotlib.text.Text):
        if not t.get_visible() or not t.get_text():
            continue
        b = t.get_window_extent(renderer)
        if b.width and b.height:
            assert b.x0 >= -1 and b.y0 >= -1 and b.x1 <= fig.bbox.width + 1 and b.y1 <= fig.bbox.height + 1, t.get_text()
    fig.savefig(HERE / f'{name}.png', dpi=220, metadata={'Title': 'Zebby model evaluation'})
    fig.savefig(HERE / f'{name}.svg', metadata={'Date': '2026-11-06', 'Creator': 'Zebby'})
    plt.close(fig)

def thinking_time():
    comparisons = [
        ('openai', 'gpt-6.1-sol', 'Medium', 'High', 'GPT-6.1 Sol', 'Cloud / Medium to High'),
        ('openai', 'gpt-6-astra', 'Medium', 'High', 'GPT-6 Astra', 'Cloud / Medium to High'),
        ('anthropic', 'claude-sonnet-5-5', 'Medium', 'High', 'Claude Sonnet 5.5', 'Cloud / Medium to High'),
        ('ollama', 'qwen3.8:27b', 'Off', 'Extra high', 'Qwen3.8 27B', 'RTX 8000 / Off to Extra high'),
        ('ollama', 'qwen3:8b', 'Off', 'On', 'Qwen3 8B', 'RTX 8000 / Off to On'),
        ('mac', 'qwen3-8b', 'Off', 'On', 'Qwen3 8B', 'M1 Max / Off to On'),
    ]
    fig = plt.figure(figsize=(13, 7.8))
    heading(fig, 'More thinking, longer waits', 'The same ten roles, with the same resume text for each role.')
    ax = fig.add_axes([.34, .16, .43, .60])
    ax.set_xlim(0, 130)
    ax.set_ylim(-.6, 5.6)
    ax.set_xticks([0, 30, 60, 90, 120])
    ax.set_xlabel('Median analysis time (seconds)', labelpad=10)
    ax.tick_params(axis='both', length=0, pad=7)
    ax.set_yticks([])
    ax.xaxis.grid(True, color=GRID, linewidth=.7)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, (provider, model, low, high, name, context) in enumerate(comparisons):
        a, b = get(provider, model, low), get(provider, model, high)
        assert a['completed'] == b['completed'] == 10
        t0, t1, y = a['median_success_seconds'], b['median_success_seconds'], 5 - i
        ax.plot([t0, t1], [y, y], color=EMBER, lw=2.2, alpha=.48, zorder=2)
        ax.scatter([t0], [y], s=76, facecolor=BG, edgecolor=INK, linewidth=1.5, zorder=4)
        ax.scatter([t1], [y], s=76, facecolor=EMBER, edgecolor=BG, linewidth=.6, zorder=5)
        y_fig = .16 + .60 * (y + .6) / 6.2
        fig.text(.045, y_fig + .009, name, fontsize=13, weight='bold')
        fig.text(.045, y_fig - .018, context, fontsize=10, color=MUTED)
        fig.text(.825, y_fig - .001, f'{t0:.1f}  →  {t1:.1f}s', fontsize=12, ha='left')
    fig.text(.825, .78, 'MEDIAN TIME', fontsize=9, color=MUTED, weight='bold')
    ax.legend(handles=[
        Line2D([], [], marker='o', color='none', markerfacecolor=BG, markeredgecolor=INK, label='Baseline setting', markersize=7),
        Line2D([], [], marker='o', color='none', markerfacecolor=EMBER, markeredgecolor=EMBER, label='Higher thinking', markersize=7),
    ], loc='lower left', bbox_to_anchor=(-.015, 1.04), frameon=False, ncol=2, fontsize=10, handletextpad=.5, columnspacing=1.8)
    fig.text(.045, .045, '10/10 completed at both settings in every comparison shown. All configurations are in the full results.', fontsize=10, color=MUTED)
    save(fig, 'thinking-time')

def full_results():
    fig = plt.figure(figsize=(13, 15.3))
    # A shorter header leaves room for the complete configuration table.
    fig.text(.045, .969, 'ZEBBY  /  MODEL EVALUATION', fontsize=10, color=EMBER, weight='bold')
    fig.text(.955, .969, '6 NOV 2026', fontsize=10, color=MUTED, ha='right')
    fig.text(.045, .934, 'Every configuration, including the failures', fontsize=23, weight='bold')
    fig.text(.045, .91, '186 completed  ·  4 output limits  ·  2 blocked before load  ·  18 not attempted', fontsize=11, color=MUTED)
    positions, groups, current, y = [], [], None, 0
    for row in ROWS:
        key = row['provider'], row['model_id']
        if key != current:
            if current is not None:
                y += .52
            groups.append((y, row))
            y += .9
            current = key
        positions.append((y, row))
        y += 1
    total = y + .25
    ax = fig.add_axes([.34, .105, .36, .755])
    status = fig.add_axes([.77, .105, .17, .755], sharey=ax)
    for a in [ax, status]:
        a.set_ylim(total, -.6)
        a.set_yticks([])
        a.tick_params(length=0)
        for spine in a.spines.values():
            spine.set_visible(False)
    ax.set_xlim(0, 132)
    ax.set_xticks([0, 30, 60, 90, 120])
    ax.set_xlabel('Median seconds, completed analyses', fontsize=10, labelpad=9)
    ax.xaxis.grid(True, color=GRID, linewidth=.65)
    ax.set_axisbelow(True)
    status.set_xlim(0, 10)
    status.set_xticks([])
    fig.text(.34, .875, 'TIME TO COMPLETE', fontsize=9, color=MUTED, weight='bold')
    fig.text(.77, .875, 'RESULTS / 10 JOBS', fontsize=9, color=MUTED, weight='bold')
    for yv, row in groups:
        fy = .105 + .755 * (total - yv) / (total + .6)
        location = 'Cloud' if row['platform'] == 'Cloud API' else 'Ollama' if row['provider'] == 'ollama' else 'M1 Max'
        fig.text(.045, fy - .003, f"{row['model']} / {location}", fontsize=11, weight='bold')
    for yv, row in positions:
        fy = .105 + .755 * (total - yv) / (total + .6)
        fig.text(.06, fy - .003, row['thinking'], fontsize=10.5, color=MUTED)
        seconds = row['median_success_seconds']
        if seconds is None:
            ax.text(2, yv, 'Blocked before loading', va='center', fontsize=10, color=MUTED)
        else:
            ax.barh(yv, seconds, height=.43, color=EMBER, alpha=.88)
            ax.text(seconds + 2.2, yv, f'{seconds:.1f}s', fontsize=10, va='center')
        statuses = [
            ('completed', GREEN), ('output_limit_failures', EMBER),
            ('memory_blocked', AMBER), ('not_attempted', GREY),
        ]
        left = 0
        for key, color in statuses:
            n = row[key]
            if n:
                status.barh(yv, n, left=left, height=.47, color=color, edgecolor=BG, linewidth=1)
                if n >= 2:
                    status.text(left + n / 2, yv, str(n), va='center', ha='center', fontsize=9,
                                color='white' if key in ['completed', 'output_limit_failures'] else INK, weight='bold')
                left += n
        assert left == 10
    fig.legend(handles=[Patch(facecolor=c, label=l) for c, l in [
        (GREEN, 'Completed'), (EMBER, 'Output limit'), (AMBER, 'Memory guard'), (GREY, 'Not attempted')
    ]], loc='lower center', bbox_to_anchor=(.5, .044), ncol=4, frameon=False, fontsize=10,
               handlelength=1, handletextpad=.5, columnspacing=1.6)
    fig.text(.045, .03, '4B On: median uses six successes. Four failures took 231-241 seconds and reached 7,096 generated tokens.', fontsize=9.5, color=MUTED)
    fig.text(.045, .015, '14B: one pre-load memory block per setting; the remaining nine jobs per setting were not attempted.', fontsize=9.5, color=MUTED)
    save(fig, 'full-results')

thinking_time()
full_results()
print('Rendered two figures as high-resolution PNG and SVG.')
